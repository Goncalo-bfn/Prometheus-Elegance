/* =========================================================
   Prometheus Elegance — Painel de Administração de Produtos
   Lógica do Cliente (admin.js)
   ========================================================= */

(function () {
  'use strict';

  // Configurações e Categorias Permitidas
  const ALLOWED_CATEGORIES = [
    'Camisetas esportivas',
    'Shorts e bermudas',
    'Conjuntos e agasalhos',
    'Fitness: tops, shorts e legging',
    'Tênis',
    'Bonés, garrafas e acessórios',
  ];

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4 Megabytes

  const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  // Estado local em memória
  let products = [];
  let pendingImageBase64 = null;
  let pendingImageFile = null;
  let itemToDeleteId = null;

  // Elementos do DOM
  const form = document.getElementById('product-form');
  const formHeading = document.getElementById('form-heading');
  const inputId = document.getElementById('prod-id');
  const inputName = document.getElementById('prod-name');
  const selectCategory = document.getElementById('prod-category');
  const inputPrice = document.getElementById('prod-price');
  const textareaDesc = document.getElementById('prod-desc');
  const inputFile = document.getElementById('prod-file');
  const inputImagePath = document.getElementById('prod-image-path');
  const dropzone = document.getElementById('photo-dropzone');
  const previewBox = document.getElementById('photo-preview-box');
  const previewImg = document.getElementById('photo-preview-img');
  const previewLabel = document.getElementById('photo-preview-label');
  const removePhotoBtn = document.getElementById('photo-remove-btn');
  const btnSubmit = document.getElementById('btn-submit');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const statusToast = document.getElementById('status-toast');

  const productListEl = document.getElementById('product-list');
  const searchInput = document.getElementById('search-input');
  const filterCategory = document.getElementById('filter-category');

  const statTotal = document.getElementById('stat-total-products');
  const statCategories = document.getElementById('stat-active-categories');
  const statAvgPrice = document.getElementById('stat-average-price');

  const deleteDialog = document.getElementById('delete-dialog');
  const deleteItemNameSpan = document.getElementById('delete-dialog-item-name');
  const btnConfirmDelete = document.getElementById('btn-confirm-delete');
  const btnCancelDelete = document.getElementById('btn-cancel-delete');

  // Exibe mensagem de status acessível
  let toastTimer = null;
  const showToast = (message, type = 'success') => {
    if (!statusToast) return;
    statusToast.textContent = message;
    statusToast.className = `status-toast active ${type}`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      statusToast.textContent = '';
      statusToast.className = 'status-toast';
    }, 4500);
  };

  // Carrega lista de produtos do servidor local ou arquivo JSON
  const fetchProducts = async () => {
    try {
      // Tenta rota de API do servidor local
      const res = await fetch('/api/products', { cache: 'no-store' });
      if (res.ok) {
        products = await res.json();
        renderProducts();
        updateStats();
        return;
      }
    } catch {
      // Fallback para arquivo estático
      try {
        const fallbackRes = await fetch('../data/products.json', { cache: 'no-store' });
        if (fallbackRes.ok) {
          products = await fallbackRes.json();
          renderProducts();
          updateStats();
          return;
        }
      } catch (err) {
        console.warn('Não foi possível carregar os produtos automaticamente:', err);
      }
    }

    renderProducts();
    updateStats();
  };

  // Atualiza métricas estatísticas
  const updateStats = () => {
    if (!statTotal) return;
    statTotal.textContent = String(products.length);

    const categoriesInUse = new Set(products.map((p) => p.category).filter(Boolean));
    if (statCategories) {
      statCategories.textContent = String(categoriesInUse.size);
    }

    if (statAvgPrice) {
      if (products.length === 0) {
        statAvgPrice.textContent = 'R$ 0,00';
      } else {
        const total = products.reduce((acc, p) => acc + (Number(p.price) || 0), 0);
        statAvgPrice.textContent = currencyFormatter.format(total / products.length);
      }
    }
  };

  // Renderiza a lista de produtos com filtragem e busca
  const renderProducts = () => {
    if (!productListEl) return;
    productListEl.replaceChildren();

    const searchTerm = (searchInput?.value ?? '').trim().toLowerCase();
    const selectedCategory = filterCategory?.value ?? '';

    const filtered = products.filter((p) => {
      const matchSearch =
        !searchTerm ||
        (p.name && p.name.toLowerCase().includes(searchTerm)) ||
        (p.description && p.description.toLowerCase().includes(searchTerm));
      const matchCategory = !selectedCategory || p.category === selectedCategory;
      return matchSearch && matchCategory;
    });

    if (filtered.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-list';
      emptyDiv.textContent =
        products.length === 0
          ? 'Nenhum produto cadastrado até o momento. Utilize o formulário ao lado para adicionar.'
          : 'Nenhum produto encontrado com os filtros selecionados.';
      productListEl.append(emptyDiv);
      return;
    }

    filtered.forEach((product) => {
      const itemEl = document.createElement('article');
      itemEl.className = 'product-item';

      // Thumbnail
      const thumb = document.createElement('img');
      thumb.className = 'item-thumb';
      thumb.src = product.image || '../assets/images/logo.png';
      thumb.alt = product.name || 'Produto';
      thumb.loading = 'lazy';
      thumb.addEventListener('error', () => {
        thumb.src = '../assets/images/logo.png';
      });

      // Detalhes
      const details = document.createElement('div');
      details.className = 'item-details';

      const header = document.createElement('div');
      header.className = 'item-header';

      const name = document.createElement('h3');
      name.className = 'item-name';
      name.textContent = product.name;

      const catBadge = document.createElement('span');
      catBadge.className = 'item-category';
      catBadge.textContent = product.category || 'Sem categoria';

      header.append(name, catBadge);

      const price = document.createElement('div');
      price.className = 'item-price';
      price.textContent = currencyFormatter.format(Number(product.price) || 0);

      details.append(header);

      if (product.description) {
        const desc = document.createElement('p');
        desc.className = 'item-desc';
        desc.textContent = product.description;
        details.append(desc);
      }

      details.append(price);

      // Ações
      const actions = document.createElement('div');
      actions.className = 'item-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-action edit';
      editBtn.textContent = 'Editar';
      editBtn.setAttribute('aria-label', `Editar ${product.name}`);
      editBtn.addEventListener('click', () => startEditing(product));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-action delete';
      deleteBtn.textContent = 'Excluir';
      deleteBtn.setAttribute('aria-label', `Excluir ${product.name}`);
      deleteBtn.addEventListener('click', () => confirmDeletion(product));

      actions.append(editBtn, deleteBtn);
      itemEl.append(thumb, details, actions);
      productListEl.append(itemEl);
    });
  };

  // Inicia edição de um produto
  const startEditing = (product) => {
    inputId.value = product.id;
    inputName.value = product.name || '';
    selectCategory.value = product.category || '';
    inputPrice.value = product.price ? String(product.price) : '';
    textareaDesc.value = product.description || '';
    inputImagePath.value = product.image || '';

    pendingImageBase64 = null;
    pendingImageFile = null;

    if (product.image) {
      previewImg.src = product.image;
      previewLabel.textContent = product.image.split('/').pop() || 'Foto atual';
      previewBox.classList.add('active');
    } else {
      previewBox.classList.remove('active');
    }

    formHeading.textContent = `Editar Produto: ${product.name}`;
    btnSubmit.textContent = 'Atualizar Produto';
    btnCancelEdit.classList.add('active');

    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    inputName.focus();
  };

  // Cancela a edição
  const cancelEditing = () => {
    form.reset();
    inputId.value = '';
    inputImagePath.value = '';
    pendingImageBase64 = null;
    pendingImageFile = null;
    previewBox.classList.remove('active');
    formHeading.textContent = 'Cadastrar Novo Produto';
    btnSubmit.textContent = 'Salvar Produto';
    btnCancelEdit.classList.remove('active');
  };

  btnCancelEdit?.addEventListener('click', cancelEditing);

  // Manipulação de Upload de Imagem
  const handleFileSelect = (file) => {
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast('Formato inválido. Selecione apenas imagens JPG, PNG ou WebP.', 'error');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      showToast('A imagem selecionada é muito grande. Tamanho máximo permitido: 4MB.', 'error');
      return;
    }

    pendingImageFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      pendingImageBase64 = reader.result;
      previewImg.src = pendingImageBase64;
      previewLabel.textContent = file.name;
      previewBox.classList.add('active');
    };
    reader.readAsDataURL(file);
  };

  inputFile?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  });

  removePhotoBtn?.addEventListener('click', () => {
    pendingImageBase64 = null;
    pendingImageFile = null;
    inputImagePath.value = '';
    if (inputFile) inputFile.value = '';
    previewBox.classList.remove('active');
  });

  // Drag and drop na dropzone
  if (dropzone) {
    ['dragenter', 'dragover'].forEach((evName) => {
      dropzone.addEventListener(evName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evName) => {
      dropzone.addEventListener(evName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFileSelect(file);
    });
  }

  // Envio do formulário (Cadastro ou Atualização)
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = inputName.value.trim();
    const category = selectCategory.value;
    const price = parseFloat(inputPrice.value);
    const description = textareaDesc.value.trim();
    const existingId = inputId.value;

    // Validações estritas
    if (!name || name.length < 2 || name.length > 100) {
      showToast('Por favor, informe um nome válido entre 2 e 100 caracteres.', 'error');
      inputName.focus();
      return;
    }

    if (!ALLOWED_CATEGORIES.includes(category)) {
      showToast('Selecione uma categoria válida para o produto.', 'error');
      selectCategory.focus();
      return;
    }

    if (!Number.isFinite(price) || price <= 0 || price > 99999) {
      showToast('Informe um preço positivo e válido (ex: 89.90).', 'error');
      inputPrice.focus();
      return;
    }

    if (description.length > 300) {
      showToast('A descrição não pode exceder 300 caracteres.', 'error');
      textareaDesc.focus();
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Salvando...';

    let finalImagePath = inputImagePath.value || '';

    // Se uma nova imagem foi selecionada, faz o upload para o servidor
    if (pendingImageFile && pendingImageBase64) {
      try {
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: pendingImageFile.name,
            contentType: pendingImageFile.type,
            data: pendingImageBase64.split(',')[1], // apenas base64 puro
          }),
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          finalImagePath = uploadData.url;
        } else {
          console.warn('Servidor de upload não respondeu, utilizando data URL como fallback.');
          finalImagePath = pendingImageBase64;
        }
      } catch {
        console.warn('Fallback offline para preview de imagem.');
        finalImagePath = pendingImageBase64;
      }
    }

    const payload = {
      name,
      category,
      price: Math.round(price * 100) / 100,
      description,
      image: finalImagePath,
    };

    try {
      if (existingId) {
        // Atualizar produto existente (PUT)
        const putRes = await fetch(`/api/products/${encodeURIComponent(existingId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!putRes.ok) {
          throw new Error('Falha ao atualizar produto no servidor local.');
        }

        const updated = await putRes.json();
        const index = products.findIndex((p) => p.id === existingId);
        if (index !== -1) products[index] = updated;

        showToast(`Produto "${name}" atualizado com sucesso!`, 'success');
      } else {
        // Cadastrar novo produto (POST)
        const postRes = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!postRes.ok) {
          throw new Error('Falha ao salvar produto no servidor local.');
        }

        const created = await postRes.json();
        products.unshift(created);

        showToast(`Produto "${name}" cadastrado com sucesso!`, 'success');
      }

      cancelEditing();
      renderProducts();
      updateStats();
    } catch (err) {
      console.error(err);
      showToast(
        'Atenção: Para persistir alterações em arquivo local, execute o servidor local (iniciar-servidor.bat).',
        'error',
      );
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = existingId ? 'Atualizar Produto' : 'Salvar Produto';
    }
  });

  // Confirmação e Exclusão de Produto
  const confirmDeletion = (product) => {
    itemToDeleteId = product.id;
    if (deleteItemNameSpan) {
      deleteItemNameSpan.textContent = `"${product.name}"`;
    }
    if (deleteDialog instanceof HTMLDialogElement) {
      deleteDialog.showModal();
    } else {
      if (confirm(`Tem certeza de que deseja excluir o produto "${product.name}"?`)) {
        executeDelete();
      }
    }
  };

  const executeDelete = async () => {
    if (!itemToDeleteId) return;

    try {
      const delRes = await fetch(`/api/products/${encodeURIComponent(itemToDeleteId)}`, {
        method: 'DELETE',
      });

      if (!delRes.ok) {
        throw new Error('Erro ao excluir no servidor.');
      }

      products = products.filter((p) => p.id !== itemToDeleteId);
      showToast('Produto excluído com sucesso!', 'success');
      renderProducts();
      updateStats();
    } catch (err) {
      console.error(err);
      showToast('Não foi possível excluir o produto no servidor local.', 'error');
    } finally {
      itemToDeleteId = null;
      if (deleteDialog instanceof HTMLDialogElement && deleteDialog.open) {
        deleteDialog.close();
      }
    }
  };

  btnConfirmDelete?.addEventListener('click', executeDelete);
  btnCancelDelete?.addEventListener('click', () => {
    itemToDeleteId = null;
    if (deleteDialog instanceof HTMLDialogElement) {
      deleteDialog.close();
    }
  });

  // Filtros em tempo real
  searchInput?.addEventListener('input', renderProducts);
  filterCategory?.addEventListener('change', renderProducts);

  // Inicialização
  fetchProducts();
})();
