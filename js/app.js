const state = {
  restaurant: null,
  products: [],
  suggestions: [],
  promotions: [],
  menuDia: [],
  filter: "todos",
  search: "",
  currentView: "category",
  cart: []
};

const $ = selector => document.querySelector(selector);

function getRestaurantId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("restaurante") || window.RESTAURANTE_POR_DEFECTO;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function truthy(value) {
  const n = normalize(value);
  return value === true || ["si", "sí", "true", "1", "x", "activo"].includes(n);
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(number);
}

function imagePath(baseUrl, folder, filename) {
  const clean = String(filename || "").trim();
  return clean
    ? `${baseUrl}imagenes/${folder}/${clean}`
    : `${baseUrl}imagenes/sin-imagen.jpg`;
}

async function loadJson(baseUrl, filename) {
  const response = await fetch(`${baseUrl}${filename}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${filename}`);
  return response.json();
}


const CART_STORAGE_KEY = "menuRestauranteCarrito";

function cartLoad() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    state.cart = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(state.cart)) state.cart = [];
  } catch (_) { state.cart = []; }
}

function cartSave() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
  renderCartBadge();
}

function cartKey(item, folder = "productos") {
  return `${folder}|${item.id || item.nombre || item.titulo || "item"}`.toLowerCase();
}

function cartAdd(item, folder = "productos", quantity = 1) {
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const key = cartKey(item, folder);
  const existing = state.cart.find(x => x.key === key);
  const name = item.nombre || item.titulo || "Producto";
  if (existing) {
    existing.quantity += qty;
  } else {
    state.cart.push({
      key,
      name,
      price: Number(item.precio) || 0,
      quantity: qty,
      folder,
      foto: item.foto || ""
    });
  }
  cartSave();
  showCartToast(`${name} agregado al carrito`);
}

function cartChange(key, quantity) {
  const item = state.cart.find(x => x.key === key);
  if (!item) return;
  const qty = parseInt(quantity, 10) || 0;
  if (qty <= 0) cartRemove(key);
  else item.quantity = qty;
  cartSave();
  renderCart();
}

function cartRemove(key) {
  state.cart = state.cart.filter(x => x.key !== key);
  cartSave();
  renderCart();
}

function cartClear() {
  state.cart = [];
  cartSave();
  renderCart();
}

function cartUnits() {
  return state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function renderCartBadge() {
  const badge = document.querySelector("#cartBadge");
  if (!badge) return;
  const units = cartUnits();
  badge.textContent = units > 99 ? "99+" : String(units);
  badge.hidden = units === 0;
}

function createCartUI() {
  if (document.querySelector("#cartButton")) return;

  const headerInner = document.querySelector(".header-inner");
  const headerTools = document.querySelector(".header-tools");
  if (!headerInner || !headerTools) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "cartButton";
  button.className = "cart-button";
  button.setAttribute("aria-label", "Ver carrito");
  button.innerHTML = `
    <span class="cart-icon-wrap" aria-hidden="true">
      <svg class="cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6"/>
        <path d="M9 20h.01M18 20h.01"/>
        <path d="M8 12h10M9 9h9"/>
      </svg>
      <span id="cartBadge" class="cart-badge" hidden>0</span>
    </span>
    <span class="cart-button-label">Carrito</span>
  `;
  button.addEventListener("click", openCart);
  headerTools.appendChild(button);

  const overlay = document.createElement("div");
  overlay.id = "cartOverlay";
  overlay.className = "cart-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="cart-modal" role="dialog" aria-modal="true" aria-labelledby="cartTitle">
      <div class="cart-header">
        <div><p class="cart-eyebrow">TU PEDIDO</p><h2 id="cartTitle">Carrito</h2></div>
        <button type="button" class="cart-close" data-cart-close aria-label="Cerrar carrito">×</button>
      </div>
      <div id="cartItems" class="cart-items"></div>
      <div class="cart-footer">
        <div class="cart-total-row"><span>Total</span><strong id="cartTotal">$ 0</strong></div>
        <button type="button" class="cart-clear" data-cart-clear>Vaciar carrito</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.closest("[data-cart-close]")) closeCart();
    const remove = event.target.closest("[data-cart-remove]");
    if (remove) cartRemove(remove.dataset.cartRemove);
    const qty = event.target.closest("[data-cart-qty]");
    if (qty) cartChange(qty.dataset.cartQty, qty.value);
    const minus = event.target.closest("[data-cart-minus]");
    if (minus) {
      const item = state.cart.find(x => x.key === minus.dataset.cartMinus);
      if (item) cartChange(item.key, item.quantity - 1);
    }
    const plus = event.target.closest("[data-cart-plus]");
    if (plus) {
      const item = state.cart.find(x => x.key === plus.dataset.cartPlus);
      if (item) cartChange(item.key, item.quantity + 1);
    }
    if (event.target.closest("[data-cart-clear]")) cartClear();
  });

  overlay.addEventListener("change", event => {
    const qty = event.target.closest("[data-cart-qty]");
    if (qty) cartChange(qty.dataset.cartQty, qty.value);
  });

  renderCartBadge();
  renderCart();
}

function openCart() {
  const overlay = $("#cartOverlay");
  if (!overlay) return;
  overlay.hidden = false;
  document.body.classList.add("cart-open");
  renderCart();
}

function closeCart() {
  const overlay = $("#cartOverlay");
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove("cart-open");
}

function renderCart() {
  const root = $("#cartItems");
  const total = $("#cartTotal");
  if (!root || !total) return;
  if (!state.cart.length) {
    root.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <h3>Tu carrito está vacío</h3>
        <p>Agregá productos de la carta para armar tu pedido.</p>
      </div>`;
    total.textContent = money(0);
    return;
  }

  root.innerHTML = state.cart.map(item => {
    const subtotal = item.price * item.quantity;
    return `
      <article class="cart-item">
        <img src="${imagePath(state.restaurant.baseUrl, item.folder, item.foto)}" alt="${escapeAttr(item.name)}" onerror="this.src='${state.restaurant.baseUrl}imagenes/sin-imagen.jpg'">
        <div class="cart-item-main">
          <div class="cart-item-top">
            <div><h3>${escapeHtml(item.name)}</h3><p>${money(item.price)} c/u</p></div>
            <button type="button" class="cart-remove" data-cart-remove="${escapeAttr(item.key)}" aria-label="Eliminar ${escapeAttr(item.name)}">×</button>
          </div>
          <div class="cart-item-bottom">
            <div class="cart-quantity">
              <button type="button" data-cart-minus="${escapeAttr(item.key)}" aria-label="Disminuir cantidad">−</button>
              <input type="number" min="1" step="1" value="${item.quantity}" data-cart-qty="${escapeAttr(item.key)}" aria-label="Cantidad de ${escapeAttr(item.name)}">
              <button type="button" data-cart-plus="${escapeAttr(item.key)}" aria-label="Aumentar cantidad">+</button>
            </div>
            <div class="cart-subtotal"><small>Subtotal</small><strong>${money(subtotal)}</strong></div>
          </div>
        </div>
      </article>`;
  }).join("");
  total.textContent = money(cartTotal());
}

function showCartToast(message) {
  let toast = document.querySelector("#cartToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "cartToast";
    toast.className = "cart-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = `✓ ${message}`;
  toast.classList.add("show");
  clearTimeout(showCartToast.timer);
  showCartToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function cartProductActionMarkup(item, folder = "productos") {
  const key = cartKey(item, folder);
  return `
    <div class="add-to-cart-row">
      <div class="add-quantity">
        <button type="button" data-quick-minus="${escapeAttr(key)}" aria-label="Disminuir cantidad">−</button>
        <input type="number" min="1" value="1" data-quick-qty="${escapeAttr(key)}" aria-label="Cantidad">
        <button type="button" data-quick-plus="${escapeAttr(key)}" aria-label="Aumentar cantidad">+</button>
      </div>
      <button type="button" class="add-cart-button" data-add-cart="${escapeAttr(key)}" data-cart-folder="${escapeAttr(folder)}">Agregar</button>
    </div>`;
}

function findCartSource(key, folder) {
  if (folder === "productos") return state.products.find(x => cartKey(x, folder) === key);
  if (folder === "promociones") return state.promotions.find(x => cartKey(x, folder) === key);
  if (folder === "sugerencias") return state.suggestions.find(x => cartKey(x, folder) === key);
  if (folder === "menu-dia") return state.menuDia.find(x => cartKey(x, folder) === key);
  return null;
}

function bindCartProductEvents() {
  const root = document.querySelector("#menuRoot") || document;
  root.querySelectorAll("[data-add-cart]").forEach(button => {
    if (button.dataset.cartBound) return;
    button.dataset.cartBound = "1";
    button.addEventListener("click", () => {
      const key = button.dataset.addCart;
      const folder = button.dataset.cartFolder;
      const input = root.querySelector(`[data-quick-qty="${CSS.escape(key)}"]`);
      cartAdd(findCartSource(key, folder), folder, input ? input.value : 1);
    });
  });
  root.querySelectorAll("[data-quick-plus]").forEach(button => {
    button.addEventListener("click", () => {
      const input = root.querySelector(`[data-quick-qty="${CSS.escape(button.dataset.quickPlus)}"]`);
      if (input) input.value = Math.max(1, parseInt(input.value, 10) || 1) + 1;
    });
  });
  root.querySelectorAll("[data-quick-minus]").forEach(button => {
    button.addEventListener("click", () => {
      const input = root.querySelector(`[data-quick-qty="${CSS.escape(button.dataset.quickMinus)}"]`);
      if (input) input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
    });
  });
}

async function init() {
  const id = getRestaurantId();
  const config = window.RESTAURANTES[id];

  if (!config) {
    renderError("No existe la configuración del restaurante solicitado.");
    return;
  }

  state.restaurant = config;
  cartLoad();
  createCartUI();

  try {
    const [products, promotions, suggestions, menuDia] = await Promise.all([
      loadJson(config.baseUrl, config.productos),
      loadJson(config.baseUrl, config.promociones),
      loadJson(config.baseUrl, config.sugerencias),
      loadJson(config.baseUrl, config.menuDia || "menu_dia.json")
    ]);

    state.products = Array.isArray(products) ? products : [];
    state.promotions = Array.isArray(promotions) ? promotions.filter(x => truthy(x.activa)) : [];
    state.suggestions = Array.isArray(suggestions) ? suggestions.filter(x => truthy(x.activa)) : [];
    state.menuDia = Array.isArray(menuDia) ? menuDia.filter(x => truthy(x.activa)) : [];

    renderRestaurant();
    renderSidebar();
    renderSpecialTiles();
    setupMobileMenu();
    bindEvents();

    showAllProducts(false);
  } catch (error) {
    console.error(error);
    renderError("No se pudo cargar la carta. Verificá que los archivos JSON estén disponibles.");
  }
}

function renderRestaurant() {
  const name = state.restaurant.nombre || "Restaurante";
  const description = state.restaurant.descripcion || "Disfrutá de nuestros sabores";

  $("#restaurantName").textContent = name;
  $("#footerRestaurantName").textContent = name;
  $("#heroTitle").textContent = name;
  $("#restaurantDescription").textContent = description;
  document.title = `${name} · Menú digital`;

  const presentation = state.restaurant.presentacion || "presentacion.jpg";
  $("#hero").style.backgroundImage = `url("${state.restaurant.baseUrl}imagenes/${presentation}")`;

  const footer = [];
  if (state.restaurant.direccion) footer.push(state.restaurant.direccion);
  if (state.restaurant.telefono) footer.push(`Tel. ${state.restaurant.telefono}`);
  if (state.restaurant.email) footer.push(state.restaurant.email);
  $("#footerInfo").innerHTML = footer.map(escapeHtml).join("<br>");

  const social = [];
  if (state.restaurant.instagram) social.push(`<a href="${safeUrl(state.restaurant.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
  if (state.restaurant.facebook) social.push(`<a href="${safeUrl(state.restaurant.facebook)}" target="_blank" rel="noopener">Facebook</a>`);
  if (state.restaurant.web) social.push(`<a href="${safeUrl(state.restaurant.web)}" target="_blank" rel="noopener">Web</a>`);
  $("#footerSocial").innerHTML = social.join("");
}

function renderSidebar() {
  const root = $("#categoryMenu");
  const hierarchy = getHierarchy(state.products.filter(product => truthy(product.disponible)));

  if (!hierarchy.size) {
    root.innerHTML = `<div class="empty-state"><h3>No hay categorías</h3></div>`;
    return;
  }

  root.innerHTML = `
    <button class="side-all-button" type="button" data-side-all>
      <span class="side-all-icon">⌂</span>
      <span>Carta completa</span>
    </button>
    <div class="side-menu-label">CATEGORÍAS</div>
    ${[...hierarchy.entries()].map(([category, subs], index) => {
      const icon = categoryIcon(category);
      return `
        <section class="side-category">
          <button class="side-category-title" type="button" data-side-category="${escapeAttr(category)}">
            <span class="side-category-icon">${icon}</span>
            <span class="side-category-name">${escapeHtml(category)}</span>
            <span class="side-category-count">${subs.size}</span>
          </button>
          <div class="side-subcategories">
            ${[...subs.keys()].map(sub => `
              <button class="side-subcategory" type="button" data-side-subcategory="${escapeAttr(sub)}" data-side-category-parent="${escapeAttr(category)}">
                <span class="side-sub-dot" aria-hidden="true"></span>
                <span>${escapeHtml(sub)}</span>
              </button>
            `).join("")}
          </div>
        </section>
      `;
    }).join("")}
  `;
}

function renderSpecialTiles() {
  setupSpecialTile("#specialPromociones", "#promoTileImage", state.promotions, "promociones", "Promociones");
  setupSpecialTile("#specialSugerencias", "#suggestionTileImage", state.suggestions, "sugerencias", "Sugerencias");
  setupSpecialTile("#specialMenuDia", "#menuDiaTileImage", state.menuDia, "menu-dia", "Menú del día");
}

function setupSpecialTile(tileSelector, imageSelector, items, folder, label) {
  const tile = $(tileSelector);
  const image = $(imageSelector);
  if (!items.length) {
    tile.hidden = true;
    return;
  }

  tile.hidden = false;
  const first = items[0];
  image.src = imagePath(state.restaurant.baseUrl, folder, first.foto);
  image.alt = label;
  image.onerror = () => { image.src = `${state.restaurant.baseUrl}imagenes/sin-imagen.jpg`; };
  tile.addEventListener("click", () => showSpecialItems(folder, label));
}

function getHierarchy(products) {
  const categories = new Map();
  products.forEach(product => {
    const category = String(product.categoria || "Sin categoría").trim();
    const subcategory = String(product.subcategoria || "General").trim();
    if (!categories.has(category)) categories.set(category, new Map());
    const subs = categories.get(category);
    if (!subs.has(subcategory)) subs.set(subcategory, []);
    subs.get(subcategory).push(product);
  });
  return categories;
}

function filteredProducts() {
  let products = state.products.filter(product => truthy(product.disponible));
  if (state.filter === "vegano") products = products.filter(p => truthy(p.vegano));
  if (state.filter === "vegetariano") products = products.filter(p => truthy(p.vegetariano));
  if (state.filter === "sintacc") products = products.filter(p => truthy(p.sinTacc));
  return products;
}

function showAllProducts(scroll = true) {
  state.currentView = "all";
  clearSearchView();
  setActiveSidebar(null, null);
  renderGroupedProducts(filteredProducts(), "Carta completa", "Todos los productos");
  setTopNavActive("home");
  if (scroll) scrollToContent();
}

function showCategory(category, scroll = true) {
  const products = filteredProducts().filter(p => String(p.categoria || "").trim() === category);
  state.currentView = "category";
  clearSearchView();
  setActiveSidebar(category, null);
  renderGroupedProducts(products, category, "Categoría");
  setTopNavActive("home");
  if (scroll) scrollToContent();
}

function showSubcategory(category, subcategory, scroll = true) {
  const products = filteredProducts().filter(p =>
    String(p.categoria || "").trim() === category &&
    String(p.subcategoria || "").trim() === subcategory
  );
  state.currentView = "subcategory";
  clearSearchView();
  setActiveSidebar(category, subcategory);
  renderGroupedProducts(products, `${category} › ${subcategory}`, "Subcategoría");
  setTopNavActive("home");
  bindCartProductEvents();
  if (scroll) scrollToContent();
}

function showSpecialItems(type, label, scroll = true) {
  let items = [];
  let folder = "";

  if (type === "promociones") { items = state.promotions; folder = "promociones"; }
  if (type === "sugerencias") { items = state.suggestions; folder = "sugerencias"; }
  if (type === "menu-dia") { items = state.menuDia; folder = "menu-dia"; }

  state.currentView = type;
  clearSearchView();
  setActiveSidebar(null, null);
  setTopNavActive(type);

  $("#contentEyebrow").textContent = "DESTACADOS";
  $("#contentTitle").textContent = label;
  $("#showAllButton").textContent = "Ver carta completa";

  $("#menuRoot").innerHTML = `
    <div class="special-results">
      <h3 class="special-results-title">${specialIcon(type)} ${escapeHtml(label)}</h3>
      <div class="products-grid">
        ${items.map(item => specialResultCard(item, folder)).join("")}
      </div>
    </div>
  `;

  bindCartProductEvents();
  if (scroll) scrollToContent();
}

function renderGroupedProducts(products, title, eyebrow) {
  $("#contentEyebrow").textContent = eyebrow.toUpperCase();
  $("#contentTitle").textContent = title;
  $("#showAllButton").textContent = title === "Carta completa" ? "Ver todos" : "Carta completa";

  const hierarchy = getHierarchy(products);
  if (!hierarchy.size) {
    $("#menuRoot").innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍽️</div>
        <h3>No hay productos para mostrar</h3>
        <p>Probá quitando los filtros.</p>
      </div>
    `;
    return;
  }

  $("#menuRoot").innerHTML = [...hierarchy.entries()].map(([category, subs]) => `
    <section class="menu-category">
      <div class="menu-category-title">
        <span class="category-mark">${categoryIcon(category)}</span>
        <span>${escapeHtml(category)}</span>
      </div>
      ${[...subs.entries()].map(([subcategory, subProducts]) => `
        <section class="menu-subcategory">
          <h3 class="menu-subcategory-title">${escapeHtml(subcategory)}</h3>
          <div class="products-grid">
            ${subProducts.map(productCard).join("")}
          </div>
        </section>
      `).join("")}
    </section>
  `).join("");

  // Las tarjetas se generan dinámicamente: volver a enlazar los controles del carrito.
  bindCartProductEvents();
}

function specialResultCard(item, folder) {
  const name = item.nombre || item.titulo || "Producto";
  return `
    <article class="special-result-card">
      <img src="${imagePath(state.restaurant.baseUrl, folder, item.foto)}"
           alt="${escapeAttr(name)}"
           loading="lazy"
           onerror="this.src='${state.restaurant.baseUrl}imagenes/sin-imagen.jpg'">
      <div class="special-result-body">
        <h3>${escapeHtml(name)}</h3>
        <p>${escapeHtml(item.descripcion || "")}</p>
        <div class="price">${money(item.precio)}</div>
        ${cartProductActionMarkup(item, folder)}
      </div>
    </article>
  `;
}

function productCard(product) {
  const unavailable = !truthy(product.disponible);
  const badges = [];
  if (truthy(product.vegano)) badges.push(`<span class="badge vegan">🌱 Vegano</span>`);
  if (truthy(product.vegetariano)) badges.push(`<span class="badge vegetarian">🥬 Vegetariano</span>`);
  if (truthy(product.sinTacc)) badges.push(`<span class="badge tacc">🌾 Sin TACC</span>`);

  return `
    <article class="product-card ${unavailable ? "unavailable" : ""}">
      <img src="${imagePath(state.restaurant.baseUrl, "productos", product.foto)}"
           alt="${escapeAttr(product.nombre || "Producto")}"
           loading="lazy"
           onerror="this.src='${state.restaurant.baseUrl}imagenes/sin-imagen.jpg'">
      <div class="product-body">
        <h3 class="product-name">${escapeHtml(product.nombre || "")}</h3>
        <p class="product-description">${escapeHtml(product.descripcion || "")}</p>
        ${product.ingredientes ? `<p class="product-ingredients">${escapeHtml(product.ingredientes)}</p>` : ""}
        <div class="product-bottom">
          <div class="product-price">${money(product.precio)}</div>
          <div class="badges">${badges.join("")}</div>
        </div>
        ${!unavailable ? cartProductActionMarkup(product, "productos") : ""}
      </div>
    </article>
  `;
}

function searchProducts() {
  const query = normalize(state.search);
  if (!query) return [];
  return filteredProducts().filter(product => {
    const haystack = [
      product.nombre,
      product.descripcion,
      product.ingredientes,
      product.categoria,
      product.subcategoria
    ].map(normalize).join(" ");
    return haystack.includes(query);
  });
}

function renderSearch() {
  const query = state.search.trim();
  if (!query) {
    $("#searchResults").hidden = true;
    $("#menuRoot").hidden = false;
    return;
  }

  const results = searchProducts();
  state.currentView = "search";
  $("#searchResults").hidden = false;
  $("#menuRoot").hidden = true;
  $("#contentEyebrow").textContent = "RESULTADOS";
  $("#contentTitle").textContent = `${results.length} resultado${results.length === 1 ? "" : "s"}`;
  $("#searchResultsList").innerHTML = results.map(productCard).join("");
  $("#emptySearch").hidden = results.length !== 0;
  bindCartProductEvents();
}

function clearSearchView() {
  state.search = "";
  $("#searchInput").value = "";
  $("#clearSearch").hidden = true;
  $("#searchResults").hidden = true;
  $("#menuRoot").hidden = false;
}

function setupMobileMenu() {
  const headerInner = document.querySelector(".header-inner");
  const topNav = document.querySelector(".top-nav");
  if (!headerInner || !topNav || document.querySelector("#mobileMenuToggle")) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "mobileMenuToggle";
  toggle.className = "mobile-menu-toggle";
  toggle.setAttribute("aria-label", "Abrir menú");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<span></span><span></span><span></span>';

  const menu = document.createElement("div");
  menu.id = "mobileMenu";
  menu.className = "mobile-menu";
  menu.hidden = true;
  menu.innerHTML = `
    <div class="mobile-menu-panel">
      <button type="button" class="mobile-menu-item" data-mobile-action="home">
        <span class="mobile-menu-icon">⌂</span><span>Carta completa</span>
      </button>
      <button type="button" class="mobile-menu-item" data-mobile-action="categories">
        <span class="mobile-menu-icon">☰</span><span>Categorías</span>
      </button>
      <button type="button" class="mobile-menu-item" data-mobile-action="promociones">
        <span class="mobile-menu-icon">🔥</span><span>Promociones</span>
      </button>
      <button type="button" class="mobile-menu-item" data-mobile-action="sugerencias">
        <span class="mobile-menu-icon">⭐</span><span>Sugerencias</span>
      </button>
      <button type="button" class="mobile-menu-item" data-mobile-action="menu-dia">
        <span class="mobile-menu-icon">🍽️</span><span>Menú del día</span>
      </button>
      <div class="mobile-menu-divider"></div>
      <button type="button" class="mobile-menu-item" data-mobile-filter="vegano">
        <span class="mobile-menu-icon vegan-icon">🌿</span><span>Vegano</span>
      </button>
      <button type="button" class="mobile-menu-item" data-mobile-filter="vegetariano">
        <span class="mobile-menu-icon vegetarian-icon">🥬</span><span>Vegetariano</span>
      </button>
      <button type="button" class="mobile-menu-item" data-mobile-filter="sintacc">
        <span class="mobile-menu-icon tacc-icon">🌾</span><span>Sin TACC</span>
      </button>
      <button type="button" class="mobile-menu-item" data-mobile-action="search">
        <span class="mobile-menu-icon">⌕</span><span>Buscar</span>
      </button>
    </div>
  `;

  headerInner.appendChild(toggle);
  headerInner.parentElement.appendChild(menu);

  const closeMenu = () => {
    menu.hidden = true;
    toggle.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Abrir menú");
  };

  const openMenu = () => {
    menu.hidden = false;
    toggle.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Cerrar menú");
  };

  toggle.addEventListener("click", () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  menu.addEventListener("click", event => {
    const actionButton = event.target.closest("[data-mobile-action]");
    const filterButton = event.target.closest("[data-mobile-filter]");

    if (actionButton) {
      const action = actionButton.dataset.mobileAction;
      if (action === "home") showAllProducts();
      if (action === "promociones") showSpecialItems("promociones", "Promociones");
      if (action === "sugerencias") showSpecialItems("sugerencias", "Sugerencias");
      if (action === "menu-dia") showSpecialItems("menu-dia", "Menú del día");
      if (action === "categories") {
        const sidebar = $(".sidebar");
        if (sidebar) sidebar.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (action === "search") {
        $("#searchPanel").hidden = false;
        $("#searchInput").focus();
        $("#searchPanel").scrollIntoView({ behavior: "smooth", block: "center" });
      }
      closeMenu();
      return;
    }

    if (filterButton) {
      const filter = filterButton.dataset.mobileFilter;
      const desktopFilter = document.querySelector(`[data-filter="${filter}"]`);
      state.filter = state.filter === filter ? "todos" : filter;
      document.querySelectorAll("[data-filter]").forEach(item => item.classList.remove("active"));
      if (state.filter !== "todos" && desktopFilter) desktopFilter.classList.add("active");
      showAllProducts(false);
      scrollToContent();
      closeMenu();
    }
  });

  document.addEventListener("click", event => {
    if (menu.hidden) return;
    if (!menu.contains(event.target) && !toggle.contains(event.target)) closeMenu();
  });
}

function bindEvents() {
  $("#brandLink").addEventListener("click", event => {
    event.preventDefault();
    showAllProducts();
  });

  $("#fullMenuButton").addEventListener("click", () => showAllProducts());
  $("#showAllButton").addEventListener("click", () => showAllProducts());

  $("#searchToggle").addEventListener("click", () => {
    $("#searchPanel").hidden = !$("#searchPanel").hidden;
    if (!$("#searchPanel").hidden) {
      $("#searchInput").focus();
      $("#searchPanel").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  $("#searchInput").addEventListener("input", event => {
    state.search = event.target.value;
    $("#clearSearch").hidden = !state.search;
    renderSearch();
  });

  $("#clearSearch").addEventListener("click", () => {
    clearSearchView();
    $("#searchInput").focus();
  });

  $("#categoryMenu").addEventListener("click", event => {
    const allButton = event.target.closest("[data-side-all]");
    if (allButton) {
      showAllProducts();
      return;
    }

    const subButton = event.target.closest("[data-side-subcategory]");
    if (subButton) {
      showSubcategory(subButton.dataset.sideCategoryParent, subButton.dataset.sideSubcategory);
      return;
    }

    const categoryButton = event.target.closest("[data-side-category]");
    if (categoryButton) showCategory(categoryButton.dataset.sideCategory);
  });


  document.querySelectorAll("[data-top-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.topAction;
      if (action === "home") showAllProducts();
      if (action === "promociones") showSpecialItems("promociones", "Promociones");
      if (action === "sugerencias") showSpecialItems("sugerencias", "Sugerencias");
      if (action === "menu-dia") showSpecialItems("menu-dia", "Menú del día");
    });
  });

  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter === state.filter ? "todos" : button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(item => item.classList.remove("active"));
      if (state.filter !== "todos") button.classList.add("active");
      showAllProducts(false);
      scrollToContent();
    });
  });
}

function setActiveSidebar(category, subcategory) {
  document.querySelectorAll(".side-category-title").forEach(button => {
    button.classList.toggle("active", category && button.dataset.sideCategory === category);
  });
  const allButton = document.querySelector("[data-side-all]");
  if (allButton) allButton.classList.toggle("active", !category);
  document.querySelectorAll(".side-subcategory").forEach(button => {
    button.classList.toggle(
      "active",
      category && subcategory &&
      button.dataset.sideCategoryParent === category &&
      button.dataset.sideSubcategory === subcategory
    );
  });
}

function setTopNavActive(action) {
  document.querySelectorAll("[data-top-action]").forEach(button => {
    button.classList.toggle("active", button.dataset.topAction === action);
  });
}

function scrollToContent() {
  const offset = window.innerWidth <= 700 ? 12 : 10;
  const top = $("#contentPanel").getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
}

function categoryIcon(category) {
  const value = normalize(category);
  if (value.includes("pizza")) return "🍕";
  if (value.includes("parrilla") || value.includes("carne") || value.includes("asado")) return "🥩";
  if (value.includes("pasta") || value.includes("pastas")) return "🍝";
  if (value.includes("entrada") || value.includes("tapa")) return "🥗";
  if (value.includes("sandwich") || value.includes("hamburgues")) return "🍔";
  if (value.includes("bebida") || value.includes("drink")) return "🥤";
  if (value.includes("postre") || value.includes("dulce")) return "🍰";
  if (value.includes("infantil") || value.includes("niño")) return "🧒";
  if (value.includes("ensalada") || value.includes("vegetal")) return "🥬";
  if (value.includes("comida") || value.includes("plato")) return "🍽️";
  return "🍴";
}

function specialIcon(type) {
  if (type === "promociones") return "🔥";
  if (type === "sugerencias") return "⭐";
  return "👨‍🍳";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "#";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function renderError(message) {
  $("#menuRoot").innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && $("#cartOverlay") && !$("#cartOverlay").hidden) closeCart();
});

document.addEventListener("DOMContentLoaded", init);
