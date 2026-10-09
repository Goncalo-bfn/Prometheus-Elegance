const toggle = document.querySelector('.menu-toggle');
const menu = document.getElementById('menu-celular');

if (toggle instanceof HTMLButtonElement && menu instanceof HTMLElement) {
  const setMenuOpen = (open) => {
    menu.style.display = open ? 'grid' : 'none';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  };

  toggle.addEventListener('click', () => {
    setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  menu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) {
      setMenuOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setMenuOpen(false);
    }
  });
}

const WHATSAPP_NUMBER = '559889184633'; // Código do país + DDD + número, somente dígitos.

const categoryCards = [...document.querySelectorAll('.category-card')];
// Cadastre produtos reais nos arrays usando { id, name, price, image }; price é informado em reais.
const categoryProducts = {
  'Camisetas esportivas': [],
  'Shorts e bermudas': [],
  'Conjuntos e agasalhos': [],
  'Fitness: tops, shorts e legging': [],
  Tênis: [],
  'Bonés, garrafas e acessórios': [],
};
const categories = categoryCards.map((card, index) => {
  const title = card.querySelector('.category-info h3')?.textContent.trim() ?? '';
  return {
    id: `category-${index + 1}`,
    card,
    title,
    products: categoryProducts[title] ?? [],
  };
});
let products = categories.flatMap((category) => category.products.map((product) => ({
  ...product,
  categoryId: category.id,
})));
const cart = new Map();
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const formatPrice = (priceInCents) => currency.format(priceInCents / 100);
const isValidPrice = (price) => Number.isFinite(price) && price > 0;
const MAX_ITEM_QUANTITY = 99;

const isSafeImageUrl = (url) => {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('./') || trimmed.startsWith('/') || trimmed.startsWith('assets/')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const renderProduct = (product, category) => {
  const productCard = document.createElement('article');
  productCard.className = 'category-product';

  if (product.image && isSafeImageUrl(product.image)) {
    const image = document.createElement('img');
    image.className = 'category-product-image';
    image.src = product.image;
    image.alt = String(product.name || category.title);
    image.loading = 'lazy';
    productCard.append(image);
  }

  const name = document.createElement('h4');
  name.textContent = product.name;

  if (product.description) {
    const desc = document.createElement('p');
    desc.className = 'category-product-desc';
    desc.textContent = product.description;
    productCard.append(desc);
  }

  const price = document.createElement('p');
  price.className = 'category-product-price';
  price.textContent = isValidPrice(product.price)
    ? formatPrice(Math.round(product.price * 100))
    : 'Preço a definir';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'sample-product-add';
  addButton.textContent = 'Adicionar ao carrinho';
  addButton.disabled = !product.id || !product.name || !isValidPrice(product.price);
  addButton.setAttribute('aria-label', `Adicionar ${product.name || 'produto'} de ${category.title} ao carrinho`);

  if (addButton.disabled) {
    addButton.title = 'Cadastre nome, identificador e preço válido para habilitar este produto.';
  }

  addButton.addEventListener('click', () => {
    if (addButton.disabled) {
      return;
    }

    const currentQty = cart.get(product.id) ?? 0;
    if (currentQty >= MAX_ITEM_QUANTITY) {
      cartAnnouncement.textContent = `Limite máximo de ${MAX_ITEM_QUANTITY} unidades atingido para este item.`;
      return;
    }

    cart.set(product.id, currentQty + 1);
    renderCart();
    cartAnnouncement.textContent = `${product.name} adicionado ao carrinho.`;
  });

  productCard.append(name, price, addButton);
  return productCard;
};

categories.forEach((category) => {
  const categoryInfo = category.card.querySelector('.category-info');
  const oldLink = categoryInfo?.querySelector('.category-link');

  if (!(categoryInfo instanceof HTMLElement) || !oldLink) {
    console.error(`Não foi possível preparar a categoria "${category.title}".`);
    return;
  }

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'category-link category-toggle';
  toggleButton.textContent = 'Ver produtos';
  toggleButton.setAttribute('aria-expanded', 'false');
  toggleButton.setAttribute('aria-controls', `${category.id}-products`);
  oldLink.replaceWith(toggleButton);

  const panel = document.createElement('div');
  panel.id = `${category.id}-products`;
  panel.className = 'category-products-panel';
  panel.hidden = true;

  categoryInfo.append(panel);
  toggleButton.addEventListener('click', () => {
    const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
    toggleButton.setAttribute('aria-expanded', String(!isExpanded));
    toggleButton.textContent = isExpanded ? 'Ver produtos' : 'Ocultar produtos';
    panel.hidden = isExpanded;
  });
});

const updateCategoryPanels = () => {
  categories.forEach((category) => {
    const panel = document.getElementById(`${category.id}-products`);
    if (!panel) return;

    panel.replaceChildren();

    const panelTitle = document.createElement('h4');
    panelTitle.textContent = 'Produtos';
    panel.append(panelTitle);

    if (category.products.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'category-products-empty';
      emptyMessage.textContent = 'Espaço reservado para os produtos desta categoria.';

      const emptySlot = document.createElement('div');
      emptySlot.className = 'category-product-slot';
      emptySlot.setAttribute('aria-hidden', 'true');
      panel.append(emptyMessage, emptySlot);
    } else {
      const productList = document.createElement('div');
      productList.className = 'category-products-list';
      category.products.forEach((product) =>
        productList.append(renderProduct({ ...product, categoryId: category.id }, category)),
      );
      panel.append(productList);
    }
  });
};

const loadCatalogProducts = async () => {
  try {
    let rawProducts = null;
    try {
      const res = await fetch('/api/products', { cache: 'no-store' });
      if (res.ok) {
        rawProducts = await res.json();
      }
    } catch {
      // Fallback para arquivo estático caso esteja rodando sem a API local
    }

    if (!rawProducts) {
      const fileRes = await fetch('./data/products.json', { cache: 'no-store' });
      if (fileRes.ok) {
        rawProducts = await fileRes.json();
      }
    }

    if (Array.isArray(rawProducts) && rawProducts.length > 0) {
      categories.forEach((category) => {
        category.products = rawProducts.filter((p) => p.category === category.title);
      });

      products = categories.flatMap((category) =>
        category.products.map((product) => ({
          ...product,
          categoryId: category.id,
        })),
      );

      updateCategoryPanels();
      renderCart();
    }
  } catch (err) {
    console.info('Executando catálogo com produtos pré-definidos:', err);
  }
};

updateCategoryPanels();

const cartButton = document.createElement('button');
cartButton.type = 'button';
cartButton.className = 'cart-trigger';
cartButton.setAttribute('aria-controls', 'cart-dialog');
cartButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg><span>Carrinho</span><span class="cart-count" aria-hidden="true">0</span>';
const mainContent = document.querySelector('main');
if (mainContent) {
  document.body.insertBefore(cartButton, mainContent);
} else {
  console.error('Não foi possível posicionar o botão do carrinho antes do conteúdo principal.');
  document.body.append(cartButton);
}

const cartDialog = document.createElement('dialog');
cartDialog.id = 'cart-dialog';
cartDialog.className = 'cart-dialog';
cartDialog.setAttribute('aria-labelledby', 'cart-title');
cartDialog.innerHTML = `
  <div class="cart-header">
    <h2 id="cart-title" tabindex="-1">Seu carrinho</h2>
    <button type="button" class="cart-close" aria-label="Fechar carrinho">&times;</button>
  </div>
  <p class="cart-empty">Seu carrinho está vazio.</p>
  <ul class="cart-items" aria-label="Produtos no carrinho"></ul>
  <div class="cart-summary">
    <p><span>Subtotal</span><strong class="cart-subtotal"></strong></p>
    <p class="cart-total"><span>Total</span><strong class="cart-total-value"></strong></p>
  </div>
  <button type="button" class="cart-checkout">Finalizar pedido pelo WhatsApp</button>
`;
document.body.append(cartDialog);

const cartCount = cartButton.querySelector('.cart-count');
const cartItems = cartDialog.querySelector('.cart-items');
const cartEmpty = cartDialog.querySelector('.cart-empty');
const cartSubtotal = cartDialog.querySelector('.cart-subtotal');
const cartTotal = cartDialog.querySelector('.cart-total-value');
const checkoutButton = cartDialog.querySelector('.cart-checkout');
const cartAnnouncement = document.createElement('p');
cartAnnouncement.className = 'visually-hidden';
cartAnnouncement.setAttribute('role', 'status');
cartAnnouncement.setAttribute('aria-live', 'polite');
document.body.append(cartAnnouncement);

cartButton.addEventListener('click', () => cartDialog.showModal());
cartDialog.querySelector('.cart-close').addEventListener('click', () => cartDialog.close());
cartDialog.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    cartDialog.close();
  }
});

const renderCart = (focusAction, focusProductId) => {
  const totalQuantity = [...cart.values()].reduce((total, quantity) => total + quantity, 0);
  let totalInCents = 0;
  cartItems.replaceChildren();

  cart.forEach((quantity, productId) => {
    const product = products.find((entry) => entry.id === productId);
    const categoryTitle = categories.find((category) => category.id === product.categoryId)?.title ?? '';
    const unitPriceInCents = Math.round(product.price * 100);
    const lineTotalInCents = unitPriceInCents * quantity;
    totalInCents += lineTotalInCents;

    const item = document.createElement('li');
    item.className = 'cart-item';

    const details = document.createElement('div');
    details.className = 'cart-item-details';

    const name = document.createElement('h3');
    name.textContent = product.name;

    const category = document.createElement('p');
    category.textContent = categoryTitle;

    const unitPrice = document.createElement('p');
    unitPrice.textContent = `Unitário: ${formatPrice(unitPriceInCents)}`;

    const lineTotal = document.createElement('p');
    lineTotal.className = 'cart-line-total';
    lineTotal.textContent = `Subtotal: ${formatPrice(lineTotalInCents)}`;
    details.append(name, category, unitPrice, lineTotal);

    const controls = document.createElement('div');
    controls.className = 'cart-item-controls';

    const decreaseButton = document.createElement('button');
    decreaseButton.type = 'button';
    decreaseButton.textContent = '−';
    decreaseButton.setAttribute('aria-label', `Diminuir quantidade de ${product.name}`);
    decreaseButton.dataset.cartAction = 'decrease';
    decreaseButton.dataset.productId = product.id;
    decreaseButton.addEventListener('click', () => {
      const nextQuantity = (cart.get(product.id) ?? 0) - 1;
      if (nextQuantity <= 0) {
        cart.delete(product.id);
      } else {
        cart.set(product.id, nextQuantity);
      }
      renderCart('decrease', product.id);
    });

    const quantityLabel = document.createElement('span');
    quantityLabel.textContent = String(quantity);
    quantityLabel.setAttribute('aria-label', `Quantidade: ${quantity}`);

    const increaseButton = document.createElement('button');
    increaseButton.type = 'button';
    increaseButton.textContent = '+';
    increaseButton.setAttribute('aria-label', `Aumentar quantidade de ${product.name}`);
    increaseButton.dataset.cartAction = 'increase';
    increaseButton.dataset.productId = product.id;
    increaseButton.disabled = quantity >= MAX_ITEM_QUANTITY;
    increaseButton.addEventListener('click', () => {
      const currentQty = cart.get(product.id) ?? 0;
      if (currentQty >= MAX_ITEM_QUANTITY) {
        return;
      }
      cart.set(product.id, currentQty + 1);
      renderCart('increase', product.id);
    });

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'cart-remove';
    removeButton.textContent = 'Remover';
    removeButton.setAttribute('aria-label', `Remover ${product.name} do carrinho`);
    removeButton.addEventListener('click', () => {
      cart.delete(product.id);
      renderCart();
      cartDialog.querySelector('#cart-title').focus();
    });

    controls.append(decreaseButton, quantityLabel, increaseButton, removeButton);
    item.append(details, controls);
    cartItems.append(item);
  });

  cartCount.textContent = String(totalQuantity);
  cartButton.setAttribute('aria-label', `Abrir carrinho. ${totalQuantity} ${totalQuantity === 1 ? 'item' : 'itens'}.`);
  cartEmpty.hidden = totalQuantity > 0;
  cartItems.hidden = totalQuantity === 0;
  cartSubtotal.textContent = formatPrice(totalInCents);
  cartTotal.textContent = formatPrice(totalInCents);
  checkoutButton.disabled = totalQuantity === 0;

  if (focusAction && cartDialog.open) {
    const nextControl = cartDialog.querySelector(`[data-cart-action="${focusAction}"][data-product-id="${focusProductId}"]`);
    (nextControl ?? cartDialog.querySelector('#cart-title')).focus();
  }
};

checkoutButton.addEventListener('click', () => {
  if (cart.size === 0) {
    console.error('Não foi possível finalizar o pedido: o carrinho está vazio.');
    return;
  }

  if (!/^\d+$/.test(WHATSAPP_NUMBER)) {
    console.error('Não foi possível finalizar o pedido: confira o número de WhatsApp em js/app.js.');
    return;
  }

  if ([...cart.keys()].some((productId) => {
    const product = products.find((entry) => entry.id === productId);
    return !product || !isValidPrice(product.price);
  })) {
    console.error('Não foi possível finalizar o pedido: um ou mais produtos estão sem preço válido.');
    return;
  }

  const lines = ['Olá! Gostaria de finalizar este pedido:', ''];
  let totalInCents = 0;

  cart.forEach((quantity, productId) => {
    const product = products.find((entry) => entry.id === productId);
    const categoryTitle = categories.find((category) => category.id === product.categoryId)?.title ?? '';
    const unitPriceInCents = Math.round(product.price * 100);
    const clampedQuantity = Math.min(Math.max(1, quantity), MAX_ITEM_QUANTITY);
    const lineTotalInCents = unitPriceInCents * clampedQuantity;
    totalInCents += lineTotalInCents;
    lines.push(
      `*${product.name}* — ${categoryTitle}`,
      `Quantidade: ${clampedQuantity}`,
      `Preço unitário: ${formatPrice(unitPriceInCents)}`,
      `Subtotal: ${formatPrice(lineTotalInCents)}`,
      '',
    );
  });

  lines.push(`*Total do pedido: ${formatPrice(totalInCents)}*`);
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;

  const secureLink = document.createElement('a');
  secureLink.href = whatsappUrl;
  secureLink.target = '_blank';
  secureLink.rel = 'noopener noreferrer';
  document.body.append(secureLink);
  secureLink.click();
  secureLink.remove();
});

const catalogNote = document.querySelector('.catalog-note');
if (catalogNote) {
  catalogNote.textContent = 'Selecione uma categoria para acessar o espaço reservado aos produtos.';
}

// Cópia segura do número do WhatsApp com feedback acessível
const copyWhatsappBtn = document.getElementById('btn-copy-whatsapp') || document.querySelector('.contact-links button');
const copyFeedback = document.querySelector('.copy-feedback');

if (copyWhatsappBtn instanceof HTMLButtonElement && copyFeedback instanceof HTMLElement) {
  let feedbackTimeout = null;
  const DISPLAYED_PHONE = '(98) 8918-4633';

  copyWhatsappBtn.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(DISPLAYED_PHONE);
      } else {
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = DISPLAYED_PHONE;
        tempTextArea.setAttribute('readonly', '');
        tempTextArea.style.position = 'fixed';
        tempTextArea.style.opacity = '0';
        tempTextArea.style.pointerEvents = 'none';
        document.body.append(tempTextArea);
        tempTextArea.focus();
        tempTextArea.select();
        document.execCommand('copy');
        tempTextArea.remove();
      }

      copyFeedback.textContent = 'Número copiado com sucesso!';
      if (feedbackTimeout) clearTimeout(feedbackTimeout);
      feedbackTimeout = setTimeout(() => {
        copyFeedback.textContent = '';
      }, 4000);
    } catch (err) {
      console.warn('Não foi possível copiar via Clipboard API:', err);
      copyFeedback.textContent = `Contato direto: ${DISPLAYED_PHONE}`;
    }
  });
}

renderCart();
loadCatalogProducts();

