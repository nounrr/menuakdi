import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Coffee,
  Edit3,
  ImagePlus,
  LogIn,
  LogOut,
  MapPin,
  Plus,
  Search,
  Shield,
  SlidersHorizontal,
  Trash2,
  Users
} from 'lucide-react';
import './styles.css';
import logoUrl from '../logo.png';

function normalizeApiBaseUrl(value) {
  const trimmed = String(value || 'http://localhost:5000/api').trim().replace(/\/+$/, '');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return /\/api$/i.test(withProtocol) ? withProtocol : `${withProtocol}/api`;
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');
const PAGE_SIZE = 20;
const DEFAULT_META = { categories: [], subcategories: [] };
const DEFAULT_PAGINATION = {
  page: 1,
  limit: PAGE_SIZE,
  totalItems: 0,
  totalPages: 1
};

const api = axios.create({ baseURL: API_BASE_URL });

function resolveDishImageUrl(imageUrl) {
  if (!imageUrl) return null;

  if (/^https?:\/\//i.test(imageUrl)) {
    try {
      const url = new URL(imageUrl);
      if (url.pathname.startsWith('/uploads/')) {
        return `${BACKEND_BASE_URL}${url.pathname}`;
      }
      return imageUrl;
    } catch {
      return imageUrl;
    }
  }

  const normalizedPath = imageUrl.startsWith('/uploads/')
    ? imageUrl
    : `/uploads/${imageUrl.replace(/^\/+/, '')}`;

  return `${BACKEND_BASE_URL}${normalizedPath}`;
}

function getToken() {
  return localStorage.getItem('token');
}

function normalizeMeta(data) {
  return {
    categories: Array.isArray(data?.categories) ? data.categories : [],
    subcategories: Array.isArray(data?.subcategories) ? data.subcategories : []
  };
}

function normalizePagination(data) {
  return {
    page: Number(data?.page) > 0 ? Number(data.page) : DEFAULT_PAGINATION.page,
    limit: Number(data?.limit) > 0 ? Number(data.limit) : DEFAULT_PAGINATION.limit,
    totalItems: Number(data?.totalItems) >= 0 ? Number(data.totalItems) : DEFAULT_PAGINATION.totalItems,
    totalPages: Number(data?.totalPages) > 0 ? Number(data.totalPages) : DEFAULT_PAGINATION.totalPages
  };
}

function normalizeDishItems(data) {
  if (Array.isArray(data)) {
    return data;
  }

  return Array.isArray(data?.items) ? data.items : [];
}

function resolveDishPagination(data, items) {
  if (Array.isArray(data)) {
    return {
      ...DEFAULT_PAGINATION,
      totalItems: items.length
    };
  }

  if (data?.pagination) {
    return normalizePagination(data.pagination);
  }

  return {
    ...DEFAULT_PAGINATION,
    totalItems: items.length
  };
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function useMenuData() {
  const [meta, setMeta] = useState(DEFAULT_META);
  const [dishes, setDishes] = useState([]);
  const [dishPagination, setDishPagination] = useState(DEFAULT_PAGINATION);
  const [loading, setLoading] = useState(true);

  const loadMeta = async () => {
    const { data } = await api.get('/categories');
    setMeta(normalizeMeta(data));
  };

  const loadDishes = async (params = {}) => {
    setLoading(true);
    try {
      const { data } = await api.get('/dishes', { params });
      const items = normalizeDishItems(data);
      setDishes(items);
      setDishPagination(resolveDishPagination(data, items));
    } catch (error) {
      setDishes([]);
      setDishPagination(DEFAULT_PAGINATION);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([loadMeta(), loadDishes({ page: 1, limit: PAGE_SIZE })]).catch(console.error);
  }, []);

  return { meta, dishes, dishPagination, loading, loadMeta, loadDishes };
}

function DishImage({ dish }) {
  const imageSrc = resolveDishImageUrl(dish.image_url);

  if (imageSrc) {
    return <img src={imageSrc} alt={dish.name_fr} />;
  }

  return (
    <div className="dishFallback">
      <Coffee size={24} />
    </div>
  );
}

function PublicMenu({ data }) {
  const {
    meta = DEFAULT_META,
    dishes = [],
    dishPagination = DEFAULT_PAGINATION,
    loading = false,
    loadDishes = () => Promise.resolve()
  } = data ?? {};
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [language, setLanguage] = useState('ar');
  const isArabic = language === 'ar';
  const text = {
    title: isArabic ? 'قائمة الطعام' : 'Recommended',
    eyebrow: isArabic ? 'القائمة الرقمية' : 'Menu digital',
    search: isArabic ? 'بحث...' : 'Search...',
    all: isArabic ? 'الكل' : 'Toutes',
    subcategories: isArabic ? 'التصنيفات الفرعية' : 'Sous-categories',
    loading: isArabic ? 'تحميل...' : 'Chargement...',
    empty: isArabic ? 'لا توجد منتجات.' : 'Aucun produit trouve.',
    products: isArabic ? 'منتج' : 'produits',
    page: isArabic ? 'صفحة' : 'Page',
    previous: isArabic ? 'السابق' : 'Precedent',
    next: isArabic ? 'التالي' : 'Suivant'
  };

  const field = (item, base) => {
    if (!item) return '';
    return isArabic ? item[`${base}_ar`] || item[`${base}_fr`] || '' : item[`${base}_fr`] || item[`${base}_ar`] || '';
  };

  const dishCategory = (dish) =>
    isArabic
      ? dish.subcategory_ar || dish.category_ar || dish.subcategory_fr || dish.category_fr
      : dish.subcategory_fr || dish.category_fr || dish.subcategory_ar || dish.category_ar;

  const priceLabel = (price) => {
    const amount = Number(price).toFixed(0);
    return isArabic ? `${amount} درهم` : `${amount} Dhs`;
  };

  useEffect(() => {
    if (!categoryId && meta.categories.length > 0) {
      setCategoryId(String(meta.categories[0].id));
    }
  }, [categoryId, meta.categories]);

  useEffect(() => {
    setPage(1);
  }, [categoryId, q]);

  useEffect(() => {
    if (page !== dishPagination.page) {
      setPage(dishPagination.page);
    }
  }, [dishPagination.page, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDishes({ categoryId, q, page, limit: PAGE_SIZE });
    }, 180);
    return () => clearTimeout(timer);
  }, [categoryId, q, page]);

  return (
    <main className="menuShell appMenuShell">
      <section className="phoneMenu" dir={isArabic ? 'rtl' : 'ltr'}>
        <header className="menuHeader">
        
          <div className="brandLine">
            <div>
              <span className="eyebrow">{text.eyebrow}</span>
            </div>
            <div className="heroMark">
              <img src={logoUrl} alt="Paradise Inn" />
            </div>
          </div>
        </header>

        <section className="filters menuControls">
          <label className="searchBox">
            <span>
              <Search size={16} />
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={text.search} />
            </span>
          </label>
          <div className="languageSwitch" aria-label="Language">
            <button className={language === 'fr' ? 'active' : ''} type="button" onClick={() => setLanguage('fr')}>
              FR
            </button>
            <button className={language === 'ar' ? 'active' : ''} type="button" onClick={() => setLanguage('ar')}>
              AR
            </button>
          </div>
          <div className="selectRow">
            <label className="selectBox">
              <SlidersHorizontal size={16} />
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">{text.all}</option>
                {meta.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {field(category, 'name')}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <div className="sectionTitle recommendedTitle">
          <span>{loading ? '...' : `${dishPagination.totalItems} ${text.products}`}</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.section
            key={`${categoryId}-${q}-${language}-${loading}-${page}`}
            className="dishGrid"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            {loading ? (
              <p className="empty">{text.loading}</p>
            ) : dishes.length ? (
              dishes.map((dish) => (
                <motion.article
                  layout
                  className={`dishCard${field(dish, 'description') ? ' hasDescription' : ''}${isArabic ? ' rtlCard' : ''}`}
                  key={dish.id}
                >
                  <DishImage dish={dish} />
                  <div className="dishInfo">
                    <div className="dishHead">
                      <div>
                        <h3>{field(dish, 'name')}</h3>
                      </div>
                    </div>
                    {field(dish, 'description') && <p className="description">{field(dish, 'description')}</p>}
                    <div className="dishFooter">
                      <span>{dishCategory(dish)}</span>
                      <strong>
                        <bdi>{priceLabel(dish.price)}</bdi>
                      </strong>
                    </div>
                  </div>
                </motion.article>
              ))
            ) : (
              <p className="empty">{text.empty}</p>
            )}
          </motion.section>
        </AnimatePresence>

        {!loading && dishPagination.totalPages > 1 && (
          <nav className="pagination" aria-label="Pagination">
            <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>
              {text.previous}
            </button>
            <span>
              {text.page} {page} / {dishPagination.totalPages}
            </span>
            <button
              type="button"
              disabled={page === dishPagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              {text.next}
            </button>
          </nav>
        )}
      </section>
    </main>
  );
}

const emptyDish = {
  id: null,
  category_id: '',
  subcategory_id: '',
  name_fr: '',
  name_ar: '',
  description_fr: '',
  description_ar: '',
  price: '',
  note: '',
  is_active: 1,
  sort_order: 0
};

function AdminPanel({ data, onLogout }) {
  const { meta, loadMeta } = data;
  const [tab, setTab] = useState('dishes');
  const [dishes, setDishes] = useState([]);
  const [dishPage, setDishPage] = useState(1);
  const [dishPagination, setDishPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });
  const [users, setUsers] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ id: null, name_fr: '', name_ar: '' });
  const [subcategoryForm, setSubcategoryForm] = useState({
    id: null,
    category_id: '',
    name_fr: '',
    name_ar: ''
  });
  const [dishForm, setDishForm] = useState(emptyDish);
  const [userForm, setUserForm] = useState({ id: null, name: '', email: '', password: '', role: 'admin' });
  const [image, setImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [dishError, setDishError] = useState('');

  const loadAdminDishes = async (nextPage = dishPage) => {
    const { data } = await api.get('/admin/dishes', { params: { page: nextPage, limit: PAGE_SIZE } });
    setDishes(data.items);
    setDishPagination(data.pagination);
    if (data.pagination.page !== nextPage) {
      setDishPage(data.pagination.page);
    }
  };

  const loadUsers = async () => {
    const { data } = await api.get('/admin/users');
    setUsers(data);
  };

  useEffect(() => {
    loadAdminDishes(dishPage).catch(console.error);
  }, [dishPage]);

  useEffect(() => {
    loadUsers().catch(console.error);
  }, []);

  useEffect(() => {
    if (!image) {
      setImagePreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(image);
    setImagePreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  const subcategories = meta.subcategories.filter(
    (item) => !dishForm.category_id || item.category_id === Number(dishForm.category_id)
  );

  const submitDish = async (event) => {
    event.preventDefault();
    setDishError('');
    const form = new FormData();
    Object.entries(dishForm).forEach(([key, value]) => form.append(key, value ?? ''));
    if (image) form.append('image', image);

    try {
      if (dishForm.id) {
        await api.put(`/admin/dishes/${dishForm.id}`, form);
      } else {
        await api.post('/admin/dishes', form);
      }
    } catch (err) {
      setDishError(err.response?.data?.message || 'Impossible d\'envoyer le plat');
      return;
    }
    setDishForm(emptyDish);
    setImage(null);
    setImagePreviewUrl('');
    if (dishForm.id) {
      await loadAdminDishes(dishPage);
    } else {
      setDishPage(1);
    }
  };

  const submitUser = async (event) => {
    event.preventDefault();
    if (userForm.id) {
      await api.put(`/admin/users/${userForm.id}`, userForm);
    } else {
      await api.post('/admin/users', userForm);
    }
    setUserForm({ id: null, name: '', email: '', password: '', role: 'admin' });
    await loadUsers();
  };

  const deleteDish = async (id) => {
    if (!confirm('Supprimer ce plat ?')) return;
    await api.delete(`/admin/dishes/${id}`);
    await loadAdminDishes(dishPage);
  };

  const deleteUser = async (id) => {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    await api.delete(`/admin/users/${id}`);
    await loadUsers();
  };

  const submitCategory = async (event) => {
    event.preventDefault();
    if (categoryForm.id) {
      await api.put(`/admin/categories/${categoryForm.id}`, categoryForm);
    } else {
      await api.post('/admin/categories', categoryForm);
    }
    setCategoryForm({ id: null, name_fr: '', name_ar: '' });
    await loadMeta();
  };

  const submitSubcategory = async (event) => {
    event.preventDefault();
    if (subcategoryForm.id) {
      await api.put(`/admin/subcategories/${subcategoryForm.id}`, subcategoryForm);
    } else {
      await api.post('/admin/subcategories', subcategoryForm);
    }
    setSubcategoryForm({ id: null, category_id: '', name_fr: '', name_ar: '' });
    await loadMeta();
  };

  const deleteCategory = async (id) => {
    if (!confirm('Supprimer cette categorie et ses sous-categories ?')) return;
    await api.delete(`/admin/categories/${id}`);
    await loadMeta();
    await loadAdminDishes(dishPage);
  };

  const deleteSubcategory = async (id) => {
    if (!confirm('Supprimer cette sous-categorie ?')) return;
    await api.delete(`/admin/subcategories/${id}`);
    await loadMeta();
    await loadAdminDishes(dishPage);
  };

  return (
    <main className="adminShell">
      <header className="adminHeader">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Gestion du menu</h1>
        </div>
        <button className="iconButton" onClick={onLogout} title="Deconnexion">
          <LogOut size={18} />
        </button>
      </header>

      <nav className="tabs">
        <button className={tab === 'dishes' ? 'active' : ''} onClick={() => setTab('dishes')}>
          <Coffee size={16} /> Plats
        </button>
        <button className={tab === 'menu' ? 'active' : ''} onClick={() => setTab('menu')}>
          <Plus size={16} /> Menu
        </button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          <Users size={16} /> Users
        </button>
      </nav>

      {tab === 'dishes' && (
        <section className="adminGrid">
          <form className="panel" onSubmit={submitDish}>
            <h2>{dishForm.id ? 'Modifier plat' : 'Ajouter plat'}</h2>
            <select
              required
              value={dishForm.category_id || ''}
              onChange={(event) => setDishForm({ ...dishForm, category_id: event.target.value, subcategory_id: '' })}
            >
              <option value="">Categorie</option>
              {meta.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name_fr}
                </option>
              ))}
            </select>
            <select
              value={dishForm.subcategory_id || ''}
              onChange={(event) => setDishForm({ ...dishForm, subcategory_id: event.target.value })}
            >
              <option value="">Sous-categorie</option>
              {subcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.name_fr}
                </option>
              ))}
            </select>
            <input required placeholder="Nom FR" value={dishForm.name_fr} onChange={(e) => setDishForm({ ...dishForm, name_fr: e.target.value })} />
            <input placeholder="Nom AR" value={dishForm.name_ar || ''} onChange={(e) => setDishForm({ ...dishForm, name_ar: e.target.value })} />
            <input required type="number" step="0.01" placeholder="Prix" value={dishForm.price} onChange={(e) => setDishForm({ ...dishForm, price: e.target.value })} />
            <textarea placeholder="Description FR" value={dishForm.description_fr || ''} onChange={(e) => setDishForm({ ...dishForm, description_fr: e.target.value })} />
            <textarea placeholder="Description AR" value={dishForm.description_ar || ''} onChange={(e) => setDishForm({ ...dishForm, description_ar: e.target.value })} />
            <label className="fileInput">
              <ImagePlus size={17} /> Image du plat
              <input type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] || null)} />
            </label>
            {image && <p className="fileMeta">Image upload: {image.name}</p>}
            {imagePreviewUrl && (
              <div className="imagePreview">
                <img src={imagePreviewUrl} alt="Apercu de l'image a uploader" />
              </div>
            )}
            {dishError && <p className="error">{dishError}</p>}
            <button className="primaryButton" type="submit">
              <Plus size={17} /> Enregistrer
            </button>
          </form>

          <div className="stack">
            <div className="tablePanel">
            {dishes.map((dish) => (
              <article className="adminRow" key={dish.id}>
                <DishImage dish={dish} />
                <div>
                  <strong>{dish.name_fr}</strong>
                  <span>{dish.category_fr} · {Number(dish.price).toFixed(0)} Dhs</span>
                </div>
                <button className="iconButton" onClick={() => setDishForm({ ...dish, image_url: undefined })} title="Modifier">
                  <Edit3 size={16} />
                </button>
                <button className="iconButton danger" onClick={() => deleteDish(dish.id)} title="Supprimer">
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
            </div>
            {dishPagination.totalPages > 1 && (
              <nav className="pagination" aria-label="Pagination admin plats">
                <button type="button" disabled={dishPage === 1} onClick={() => setDishPage((current) => current - 1)}>
                  Precedent
                </button>
                <span>
                  Page {dishPage} / {dishPagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={dishPage === dishPagination.totalPages}
                  onClick={() => setDishPage((current) => current + 1)}
                >
                  Suivant
                </button>
              </nav>
            )}
          </div>
        </section>
      )}

      {tab === 'menu' && (
        <section className="adminGrid">
          <div className="stack">
            <form className="panel" onSubmit={submitCategory}>
              <h2>{categoryForm.id ? 'Modifier categorie' : 'Ajouter categorie'}</h2>
              <input required placeholder="Categorie FR" value={categoryForm.name_fr} onChange={(e) => setCategoryForm({ ...categoryForm, name_fr: e.target.value })} />
              <input placeholder="Categorie AR" value={categoryForm.name_ar || ''} onChange={(e) => setCategoryForm({ ...categoryForm, name_ar: e.target.value })} />
              <button className="primaryButton" type="submit">
                <Plus size={17} /> Enregistrer
              </button>
            </form>

            <form className="panel" onSubmit={submitSubcategory}>
              <h2>{subcategoryForm.id ? 'Modifier sous-categorie' : 'Ajouter sous-categorie'}</h2>
              <select required value={subcategoryForm.category_id} onChange={(e) => setSubcategoryForm({ ...subcategoryForm, category_id: e.target.value })}>
                <option value="">Categorie parent</option>
                {meta.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name_fr}
                  </option>
                ))}
              </select>
              <input required placeholder="Sous-categorie FR" value={subcategoryForm.name_fr} onChange={(e) => setSubcategoryForm({ ...subcategoryForm, name_fr: e.target.value })} />
              <input placeholder="Sous-categorie AR" value={subcategoryForm.name_ar || ''} onChange={(e) => setSubcategoryForm({ ...subcategoryForm, name_ar: e.target.value })} />
              <button className="primaryButton" type="submit">
                <Plus size={17} /> Enregistrer
              </button>
            </form>
          </div>

          <div className="tablePanel">
            {meta.categories.map((category) => (
              <article className="adminRow menuRow" key={category.id}>
                <div>
                  <strong>{category.name_fr}</strong>
                  <span>{category.name_ar || 'Categorie'} · {meta.subcategories.filter((item) => item.category_id === category.id).length} sous-categories</span>
                </div>
                <button className="iconButton" onClick={() => setCategoryForm(category)} title="Modifier">
                  <Edit3 size={16} />
                </button>
                <button className="iconButton danger" onClick={() => deleteCategory(category.id)} title="Supprimer">
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
            {meta.subcategories.map((subcategory) => (
              <article className="adminRow menuRow" key={`sub-${subcategory.id}`}>
                <div>
                  <strong>{subcategory.name_fr}</strong>
                  <span>{subcategory.name_ar || 'Sous-categorie'}</span>
                </div>
                <button className="iconButton" onClick={() => setSubcategoryForm(subcategory)} title="Modifier">
                  <Edit3 size={16} />
                </button>
                <button className="iconButton danger" onClick={() => deleteSubcategory(subcategory.id)} title="Supprimer">
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'users' && (
        <section className="adminGrid">
          <form className="panel" onSubmit={submitUser}>
            <h2>{userForm.id ? 'Modifier user' : 'Ajouter user'}</h2>
            <input required placeholder="Nom" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
            <input required type="email" placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
            <input type="password" placeholder={userForm.id ? 'Nouveau mot de passe' : 'Mot de passe'} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            <button className="primaryButton" type="submit">
              <Shield size={17} /> Enregistrer
            </button>
          </form>
          <div className="tablePanel">
            {users.map((user) => (
              <article className="adminRow userRow" key={user.id}>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <button className="iconButton" onClick={() => setUserForm({ ...user, password: '' })} title="Modifier">
                  <Edit3 size={16} />
                </button>
                <button className="iconButton danger" onClick={() => deleteUser(user.id)} title="Supprimer">
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@paradise.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.response?.data?.message || 'Connexion impossible');
    }
  };

  return (
    <main className="loginShell">
      <form className="loginBox" onSubmit={submit}>
        <span className="eyebrow">Admin Paradise</span>
        <h1>Connexion</h1>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mot de passe" />
        {error && <p className="error">{error}</p>}
        <button className="primaryButton" type="submit">
          <LogIn size={17} /> Entrer
        </button>
      </form>
    </main>
  );
}

function App() {
  const data = useMenuData();
  const [view, setView] = useState(() => (window.location.pathname === '/admin' ? 'admin' : 'menu'));
  const [user, setUser] = useState(() => (getToken() ? { role: 'admin' } : null));

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    window.history.pushState({}, '', '/');
    setView('menu');
  };

  useEffect(() => {
    const syncRoute = () => {
      setView(window.location.pathname === '/admin' ? (getToken() ? 'admin' : 'login') : 'menu');
    };

    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  return (
    <>
      {view === 'menu' && <PublicMenu data={data} />}
      {view === 'login' && <Login onLogin={(nextUser) => { setUser(nextUser); window.history.pushState({}, '', '/admin'); setView('admin'); }} />}
      {view === 'admin' && user && <AdminPanel data={data} onLogout={logout} />}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
