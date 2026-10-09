# ====================================================================
# Prometheus Elegance - Servidor Local de Desenvolvimento & API
# Executa nativamente no Windows PowerShell (sem dependencias externas)
# ====================================================================

param (
    [int]$Port = 8000
)

try {
    $Host.UI.RawUI.WindowTitle = "Prometheus Elegance - Servidor Local [Porta $Port]"
} catch {
    # Ignora erro se executado em sessao nao-interativa
}

$rootPath = $PSScriptRoot
if (-not $rootPath) { $rootPath = (Get-Location).Path }

# Garante que os diretorios de dados e uploads existam
$dataPath = Join-Path $rootPath "data"
$uploadsPath = Join-Path $rootPath "assets\uploads"
$productsFile = Join-Path $dataPath "products.json"

if (-not (Test-Path $dataPath)) { New-Item -ItemType Directory -Path $dataPath -Force | Out-Null }
if (-not (Test-Path $uploadsPath)) { New-Item -ItemType Directory -Path $uploadsPath -Force | Out-Null }
if (-not (Test-Path $productsFile)) { Set-Content -Path $productsFile -Value "[]" -Encoding UTF8 }

# Mapa de tipos MIME
$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff2"= "font/woff2"
    ".woff" = "font/woff"
    ".txt"  = "text/plain; charset=utf-8"
}

# Inicializa o listener HTTP
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "[ERRO] Nao foi possivel iniciar na porta $Port. Ela pode estar em uso." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  PROMETHEUS ELEGANCE - Servidor Local Ativo" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  > Loja / Catalogo:    http://localhost:$Port/" -ForegroundColor Green
Write-Host "  > Painel de Produtos: http://localhost:$Port/admin" -ForegroundColor Yellow
Write-Host "  > Pressione Ctrl+C para encerrar o servidor" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Funcao auxiliar para enviar resposta JSON
function Send-JsonResponse($response, [int]$statusCode, $data) {
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json; charset=utf-8"
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $response.Headers.Add("X-Content-Type-Options", "nosniff")

    $jsonString = if ($data -is [string]) { $data } else { $data | ConvertTo-Json -Depth 10 -Compress }
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonString)
    $response.ContentLength64 = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.OutputStream.Close()
}

# Funcao auxiliar para ler JSON da requisicao
function Get-RequestBodyJson($request) {
    try {
        $encoding = if ($request.ContentEncoding) { $request.ContentEncoding } else { [System.Text.Encoding]::UTF8 }
        $reader = New-Object System.IO.StreamReader($request.InputStream, $encoding)
        $rawBody = $reader.ReadToEnd()
        $reader.Close()
        if ([string]::IsNullOrWhiteSpace($rawBody)) { return $null }
        return $rawBody | ConvertFrom-Json
    } catch {
        return $null
    }
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $httpMethod = $request.HttpMethod
        $rawUrl = $request.Url.AbsolutePath

        # Trata preflight CORS OPTIONS
        if ($httpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
            $response.OutputStream.Close()
            continue
        }

        # -------------------------------------------------------------
        # 1. API: /api/products
        # -------------------------------------------------------------
        if ($rawUrl -match "^/api/products/?$") {
            if ($httpMethod -eq "GET") {
                $content = Get-Content -Path $productsFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
                if (-not $content) { $content = "[]" }
                Send-JsonResponse $response 200 $content
                continue
            }
            elseif ($httpMethod -eq "POST") {
                $body = Get-RequestBodyJson $request
                if (-not $body -or [string]::IsNullOrWhiteSpace($body.name) -or [string]::IsNullOrWhiteSpace($body.category) -or ($null -eq $body.price)) {
                    Send-JsonResponse $response 400 @{ error = "Campos obrigatorios ausentes ou invalidos." }
                    continue
                }

                $content = Get-Content -Path $productsFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
                $items = if ($content) { $content | ConvertFrom-Json } else { @() }
                if (-not ($items -is [System.Collections.IEnumerable])) { $items = @($items) }

                $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                $randomSuffix = Get-Random -Minimum 100 -Maximum 999
                $newId = "prod-$nowMs-$randomSuffix"

                $newItem = [PSCustomObject]@{
                    id          = $newId
                    name        = [string]$body.name
                    price       = [double]$body.price
                    description = [string]$body.description
                    category    = [string]$body.category
                    image       = [string]$body.image
                }

                $updatedItems = @($newItem) + @($items)
                $updatedJson = $updatedItems | ConvertTo-Json -Depth 5
                Set-Content -Path $productsFile -Value $updatedJson -Encoding UTF8

                Send-JsonResponse $response 201 $newItem
                continue
            }
        }

        # -------------------------------------------------------------
        # 2. API: /api/products/:id (PUT ou DELETE)
        # -------------------------------------------------------------
        if ($rawUrl -match "^/api/products/([^/]+)$") {
            $targetId = [System.Uri]::UnescapeDataString($Matches[1])

            $content = Get-Content -Path $productsFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
            $items = if ($content) { $content | ConvertFrom-Json } else { @() }
            if (-not ($items -is [System.Collections.IEnumerable])) { $items = @($items) }

            if ($httpMethod -eq "PUT") {
                $body = Get-RequestBodyJson $request
                $found = $false
                $updatedItem = $null

                for ($i = 0; $i -lt $items.Count; $i++) {
                    if ($items[$i].id -eq $targetId) {
                        $items[$i].name        = [string]$body.name
                        $items[$i].price       = [double]$body.price
                        $items[$i].description = [string]$body.description
                        $items[$i].category    = [string]$body.category
                        if ($body.image) { $items[$i].image = [string]$body.image }
                        $updatedItem = $items[$i]
                        $found = $true
                        break
                    }
                }

                if ($found) {
                    $updatedJson = $items | ConvertTo-Json -Depth 5
                    Set-Content -Path $productsFile -Value $updatedJson -Encoding UTF8
                    Send-JsonResponse $response 200 $updatedItem
                } else {
                    Send-JsonResponse $response 404 @{ error = "Produto nao encontrado." }
                }
                continue
            }
            elseif ($httpMethod -eq "DELETE") {
                $filteredItems = @($items | Where-Object { $_.id -ne $targetId })
                $updatedJson = $filteredItems | ConvertTo-Json -Depth 5
                Set-Content -Path $productsFile -Value $updatedJson -Encoding UTF8
                Send-JsonResponse $response 200 @{ success = $true; id = $targetId }
                continue
            }
        }

        # -------------------------------------------------------------
        # 3. API: /api/upload (Upload seguro de fotos base64)
        # -------------------------------------------------------------
        if ($rawUrl -eq "/api/upload" -and $httpMethod -eq "POST") {
            $body = Get-RequestBodyJson $request
            if (-not $body -or -not $body.data -or -not $body.contentType) {
                Send-JsonResponse $response 400 @{ error = "Dados da imagem invalidos." }
                continue
            }

            $allowedMimes = @("image/jpeg", "image/png", "image/webp")
            if ($allowedMimes -notcontains $body.contentType) {
                Send-JsonResponse $response 400 @{ error = "Tipo de imagem nao permitido. Use JPG, PNG ou WebP." }
                continue
            }

            try {
                $imageBytes = [System.Convert]::FromBase64String($body.data)
                if ($imageBytes.Length -gt 4194304) { # 4 MB
                    Send-JsonResponse $response 400 @{ error = "Imagem excede o limite de 4MB." }
                    continue
                }

                $ext = switch ($body.contentType) {
                    "image/png"  { ".png" }
                    "image/webp" { ".webp" }
                    default      { ".jpg" }
                }

                $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                $rnd = Get-Random -Minimum 1000 -Maximum 9999
                $safeFilename = "foto-$nowMs-$rnd$ext"
                $savePath = Join-Path $uploadsPath $safeFilename

                [System.IO.File]::WriteAllBytes($savePath, $imageBytes)

                $relativeUrl = "./assets/uploads/$safeFilename"
                Send-JsonResponse $response 201 @{ url = $relativeUrl }
                continue
            } catch {
                Send-JsonResponse $response 500 @{ error = "Falha ao gravar arquivo no disco." }
                continue
            }
        }

        # -------------------------------------------------------------
        # 4. Servir Arquivos Estatisticos (index.html, /admin, css, js, etc.)
        # -------------------------------------------------------------
        $decodedUrl = [System.Uri]::UnescapeDataString($rawUrl)

        # Mapeamento de rotas de pagina
        if ($decodedUrl -eq "/" -or $decodedUrl -eq "") {
            $filePath = Join-Path $rootPath "index.html"
        } elseif ($decodedUrl -eq "/admin" -or $decodedUrl -eq "/admin/") {
            $filePath = Join-Path $rootPath "admin\index.html"
        } else {
            # Limpa caminhos relativos maliciosos (prevencao de Path Traversal)
            $cleanRelative = $decodedUrl.TrimStart("/").Replace("/", "\")
            $cleanRelative = $cleanRelative -replace '\.\.+[\\\/]?', ''
            $filePath = Join-Path $rootPath $cleanRelative
        }

        # Se for um diretorio, procura index.html
        if ((Test-Path $filePath) -and (Get-Item $filePath) -is [System.IO.DirectoryInfo]) {
            $filePath = Join-Path $filePath "index.html"
        }

        if (Test-Path $filePath -PathType Leaf) {
            $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }

            $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.StatusCode = 200
            $response.ContentType = $contentType
            $response.ContentLength64 = $fileBytes.Length
            $response.Headers.Add("X-Content-Type-Options", "nosniff")
            $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
            $response.OutputStream.Close()
        } else {
            # Arquivo nao encontrado (404)
            $notFoundMsg = "Recurso nao encontrado: $decodedUrl"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($notFoundMsg)
            $response.StatusCode = 404
            $response.ContentType = "text/plain; charset=utf-8"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.OutputStream.Close()
        }
    }
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
        $listener.Close()
    }
}
