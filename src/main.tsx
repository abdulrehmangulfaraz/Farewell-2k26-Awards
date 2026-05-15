import './index.css';
import { supabase } from './lib/supabase';

// --- TYPES ---
interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  emoji: string;
  isOpen: boolean;
}

interface Nominee {
  id: string;
  categoryId: string;
  name: string;
  photoUrl: string;
  tagline: string;
}

interface Vote {
  id?: string;
  nomineeId: string;
  categoryId: string;
  voterId: string;
  votedAt: number;
}

interface State {
  categories: Category[];
  nominees: Nominee[];
  votes: Vote[];
  userVotes: Record<string, string>; // categoryId -> nomineeId
  adminLoggedIn: boolean;
}

const generateId = () => Math.random().toString(36).substr(2, 9);
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return generateId() + '-' + generateId();
};

const getVoterId = () => {
  let id = localStorage.getItem('voterId');
  if (!id) {
    id = generateUUID();
    localStorage.setItem('voterId', id);
  }
  return id;
};

const VOTER_ID = getVoterId();

// --- STATE MANAGEMENT ---
const INITIAL_STATE: State = {
  categories: [],
  nominees: [],
  votes: [],
  userVotes: JSON.parse(localStorage.getItem('userVotes') || '{}'),
  adminLoggedIn: localStorage.getItem('adminLoggedIn') === 'true'
};

const saveStateLocal = () => {
  localStorage.setItem('userVotes', JSON.stringify(INITIAL_STATE.userVotes));
  localStorage.setItem('adminLoggedIn', String(INITIAL_STATE.adminLoggedIn));
};

let isLoadingSupabase = true;

export const loadDataFromSupabase = async () => {
  if (!supabase) return;
  isLoadingSupabase = true;
  
  try {
    const [catRes, nomRes, voteRes] = await Promise.all([
      supabase.from('categories').select('*').order('created_at', { ascending: true }),
      supabase.from('nominees').select('*').order('created_at', { ascending: true }),
      supabase.from('votes').select('*')
    ]);

    if (!catRes.error) {
      INITIAL_STATE.categories = catRes.data.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description || '',
        emoji: c.emoji || '🏆',
        isOpen: c.is_open
      }));
    }

    if (!nomRes.error) {
      INITIAL_STATE.nominees = nomRes.data.map(n => ({
        id: n.id,
        categoryId: n.category_id,
        name: n.name,
        photoUrl: n.photo_url,
        tagline: n.tagline
      }));
    }

    if (!voteRes.error) {
      INITIAL_STATE.votes = voteRes.data.map(v => ({
        id: v.id,
        nomineeId: v.nominee_id,
        categoryId: v.category_id,
        voterId: v.voter_id,
        votedAt: new Date(v.voted_at).getTime()
      }));
      
      // Update local userVotes based on remote
      const myVotes = voteRes.data.filter(v => v.voter_id === VOTER_ID);
      myVotes.forEach(v => {
        INITIAL_STATE.userVotes[v.category_id] = v.nominee_id;
      });
      saveStateLocal();
    }
  } catch (err) {
    console.error('Error fetching from Supabase', err);
  } finally {
    isLoadingSupabase = false;
    routes(); // Re-render once loaded
  }
};

// --- UTILS ---
const $ = (id: string) => document.getElementById(id);
const render = (html: string) => {
  const app = $('app');
  if (app) {
    app.innerHTML = `<div class="fade-in min-h-screen hero-gradient flex flex-col">${html}</div>`;
    window.scrollTo(0, 0);
  }
};


const slugify = (text: string) => text.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');

// --- ROUTER ---
const routes = () => {
  if (isLoadingSupabase) {
    return render(`
      <main class="flex-1 flex flex-col justify-center items-center text-center px-12 pt-20 pb-32">
        <div class="glass-card p-10 flex flex-col items-center">
          <h2 class="text-2xl text-gold mb-2 font-display">Loading Data...</h2>
          <p class="text-white/50 text-sm">Connecting to Supabase.</p>
        </div>
      </main>
    `);
  }

  const hash = window.location.hash || '#/';
  
  // Public Routes
  if (hash === '#/') return renderHome();
  if (hash.startsWith('#/vote/')) return renderVotePage(hash.replace('#/vote/', ''));
  
  // Admin Routes
  if (hash === '#/admin') return renderAdminLogin();
  
  if (!INITIAL_STATE.adminLoggedIn && hash.startsWith('#/admin/')) {
    window.location.hash = '#/admin';
    return;
  }
  
  if (hash === '#/admin/dashboard') return renderAdminDashboard();
  if (hash.startsWith('#/admin/nominees/')) return renderAdminNominees(hash.replace('#/admin/nominees/', ''));
  if (hash === '#/admin/results') return renderAdminResults();
  
  renderHome();
};

window.addEventListener('hashchange', routes);

// --- NAVIGATION ---
const Navbar = (isAdmin = false) => {
  const hash = window.location.hash || '#/';
  return `
  <nav class="px-12 pt-8 flex justify-between items-center max-w-7xl mx-auto w-full">
    <a href="#/" class="flex items-center gap-3 group">
      <div class="w-10 h-10 border border-[#FFD700] rounded-full flex items-center justify-center font-bold text-xs gold-text group-hover:bg-gold group-hover:text-black transition-all">CS22</div>
      <div class="flex flex-col">
        <span class="text-sm font-bold tracking-widest uppercase">UET LAHORE</span>
        <span class="text-[10px] opacity-50 uppercase tracking-tighter">Farewell Awards Edition</span>
      </div>
    </a>
    <div class="flex gap-10 items-center">
      ${isAdmin ? `
        <a href="#/admin/dashboard" class="nav-link ${hash === '#/admin/dashboard' ? 'active' : ''}">Dashboard</a>
        <a href="#/admin/results" class="nav-link ${hash === '#/admin/results' ? 'active' : ''}">Results</a>
        <button onclick="logoutAdmin()" class="text-[10px] uppercase tracking-widest text-red-500 hover:text-white transition-colors cursor-pointer">Logout</button>
      ` : `
        <a href="#/" class="nav-link ${hash === '#/' ? 'active' : ''}">Categories</a>
        <a href="#/admin" class="nav-link ${hash === '#/admin' ? 'active' : ''}">Admin Portal</a>
      `}
    </div>
  </nav>
`;
};

// --- VIEWS ---

function renderHome() {
  const openCats = INITIAL_STATE.categories.filter(c => c.isOpen);
  const totalVotes = INITIAL_STATE.votes.length;

  render(`
    ${Navbar()}
    <main class="flex-1 flex flex-col justify-center items-center text-center px-12 pt-20 pb-32">
      <div class="mb-4">
        <span class="category-badge">Live Voting Phase</span>
      </div>
      <h1 class="text-6xl md:text-7xl gold-text mb-4 tracking-tight">The Prestige Ceremony</h1>
      <p class="text-white/60 text-lg max-w-2xl mb-16 italic font-display">
        Recognizing the brilliance, the bugs, and the bonds of CS Batch 2022. Your vote defines the legacy.
      </p>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
        ${INITIAL_STATE.categories.map(cat => `
          <div class="glass-card p-10 flex flex-col items-center text-center group cursor-pointer" onclick="window.location.hash='#/vote/${cat.slug}'">
            <div class="text-5xl mb-6 group-hover:scale-110 transition-transform duration-500">
              ${cat.emoji || '🏆'}
            </div>
            <h3 class="text-2xl mb-2">${cat.name}</h3>
            <p class="text-white/40 text-xs mb-8 leading-relaxed max-w-[200px]">
              ${cat.description || 'Cast your vote for this category'}
            </p>
            
            <div class="w-full mt-auto">
              ${cat.isOpen ? `
                <button class="btn-category-enter">Enter Category</button>
              ` : `
                <span class="text-[10px] uppercase tracking-widest text-gray-500 border border-white/10 px-4 py-2 block">Closed</span>
              `}
            </div>
          </div>
        `).join('')}
        ${INITIAL_STATE.categories.length === 0 ? `
          <div class="col-span-full p-20 glass-card">
            <p class="text-white/40">The registry is currently empty. The committee is curating the categories.</p>
          </div>
        ` : ''}
      </div>
    </main>
    
    <footer class="mt-auto px-12 py-10 border-t border-white/5 flex justify-between items-center w-full max-w-7xl mx-auto">
      <div class="flex gap-12">
        <div class="flex flex-col">
          <span class="text-[10px] uppercase text-white/30 tracking-widest mb-1">Active Categories</span>
          <span class="text-sm gold-text font-mono">${INITIAL_STATE.categories.filter(c => c.isOpen).length}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-[10px] uppercase text-white/30 tracking-widest mb-1">Total Votes</span>
          <span class="text-sm gold-text font-mono">${totalVotes}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-[10px] uppercase text-white/30 tracking-widest mb-1">Status</span>
          <span class="text-sm gold-text font-mono uppercase tracking-tighter">Ceremony Pending</span>
        </div>
      </div>
      <div class="text-right">
        <p class="text-[10px] text-white/20 uppercase tracking-[3px]">UET LAHORE — BATCH OF 2022</p>
      </div>
    </footer>
  `);
}

function renderVotePage(slug: string) {
  const cat = INITIAL_STATE.categories.find(c => c.slug === slug);
  if (!cat) return renderHome();

  const nominees = INITIAL_STATE.nominees.filter(n => n.categoryId === cat.id);
  const myVote = INITIAL_STATE.userVotes[cat.id];

  render(`
    ${Navbar()}
    <div class="max-w-5xl mx-auto px-6 py-12">
      <div class="mb-12">
        <a href="#/" class="text-gold text-sm flex items-center gap-2 mb-8 hover:underline">
           &larr; Back to Categories
        </a>
        <div class="flex items-center gap-6 mb-4">
          <span class="text-6xl">${cat.emoji || '🏆'}</span>
          <div>
            <h1 class="text-4xl md:text-5xl font-bold">${cat.name}</h1>
            <p class="text-gray-400 mt-2">${cat.description}</p>
          </div>
        </div>
      </div>

      ${!cat.isOpen ? `
        <div class="glass-card p-12 text-center rounded-3xl">
          <p class="text-2xl font-display text-gold mb-2">Voting is now closed for this category.</p>
          <p class="text-gray-400">The results will be announced at the farewell ceremony!</p>
        </div>
      ` : myVote ? `
        <div class="glass-card p-12 text-center rounded-3xl mb-12">
          <div class="text-5xl mb-4">✅</div>
          <h2 class="text-3xl font-display text-gold mb-2">You've cast your vote!</h2>
          <p class="text-gray-400 mb-8">Thank you for participating. Your pick: <strong>${nominees.find(n => n.id === myVote)?.name}</strong></p>
          <a href="#/" class="btn-outline">Browse other categories</a>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 opacity-50 grayscale pointer-events-none">
          ${nominees.map(n => `
            <div class="glass-card rounded-2xl overflow-hidden ${n.id === myVote ? 'border-4 border-gold opacity-100 grayscale-0 ring-4 ring-gold/20' : ''}">
               <div class="aspect-square bg-gray-800">
                <img src="${n.photoUrl}" class="w-full h-full object-cover" alt="${n.name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(n.name)}&background=111&color=FFD700'">
              </div>
              <div class="p-4 text-center">
                <h3 class="font-bold">${n.name}</h3>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
          ${nominees.length === 0 ? `<p class="col-span-full text-center p-20 text-gray-500">No nominees in this category yet.</p>` : ''}
          ${nominees.map(n => `
            <div 
              class="glass-card rounded-2xl overflow-hidden cursor-pointer group nominee-card" 
              id="nominee-${n.id}"
              onclick="selectNominee('${n.id}')"
            >
              <div class="aspect-square relative overflow-hidden">
                <img src="${n.photoUrl}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="${n.name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(n.name)}&background=111&color=FFD700'">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                  <p class="text-xs text-gold italic">"${n.tagline}"</p>
                </div>
              </div>
              <div class="p-6 text-center">
                <h3 class="text-xl font-bold mb-1 group-hover:text-gold transition-colors">${n.name}</h3>
                <div class="vote-indicator opacity-0 group-hover:opacity-30 border border-gold text-gold text-[10px] uppercase tracking-widest py-1 px-3 rounded-full inline-block mt-2">Select</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div id="vote-footer" class="fixed bottom-0 left-0 right-0 p-8 bg-black/80 backdrop-blur-md border-t border-gold/20 translate-y-full transition-transform duration-500 z-50 flex justify-center">
            <button id="cast-vote-btn" class="btn-gold !px-16" onclick="castVote('${cat.id}')">CAST YOUR VOTE</button>
        </div>
      `}
    </div>
  `);
}

function renderAdminLogin() {
  render(`
    ${Navbar()}
    <div class="max-w-md mx-auto px-6 py-20">
      <div class="glass-card p-10 rounded-3xl">
        <h1 class="text-3xl font-display text-gold mb-8 text-center italic">Royal Access ⚜️</h1>
        <form onsubmit="handleLogin(event)">
          <div class="mb-6">
            <label class="block text-xs uppercase tracking-widest text-gray-500 mb-2 font-bold">Secret Key</label>
            <input type="password" id="password" required class="w-full bg-white/5 border border-white/10 rounded-xl p-4 focus:outline-none focus:border-gold transition-all" placeholder="Enter password...">
          </div>
          <button type="submit" class="w-full btn-gold">AUTHENTICATE</button>
        </form>
        <p class="text-center text-xs text-gray-600 mt-6">Hints: Check batch farewell group</p>
      </div>
    </div>
  `);
}

function renderAdminDashboard() {
  const stats = {
    cats: INITIAL_STATE.categories.length,
    noms: INITIAL_STATE.nominees.length,
    votes: INITIAL_STATE.votes.length
  };

  render(`
    ${Navbar(true)}
    <div class="max-w-7xl mx-auto px-6 py-12">
      <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <h1 class="text-4xl font-bold">Admin Dashboard</h1>
        <button onclick="showCategoryModal()" class="btn-gold !py-2 !px-6">+ New Category</button>
      </header>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div class="glass-card p-6 rounded-2xl flex flex-col items-center">
           <span class="text-gray-500 text-xs uppercase tracking-widest mb-2">Total Categories</span>
           <span class="text-4xl font-display text-gold">${stats.cats}</span>
        </div>
        <div class="glass-card p-6 rounded-2xl flex flex-col items-center">
           <span class="text-gray-500 text-xs uppercase tracking-widest mb-2">Total Nominees</span>
           <span class="text-4xl font-display text-gold">${stats.noms}</span>
        </div>
        <div class="glass-card p-6 rounded-2xl flex flex-col items-center">
           <span class="text-gray-500 text-xs uppercase tracking-widest mb-2">Votes Cast</span>
           <span class="text-4xl font-display text-gold">${stats.votes}</span>
        </div>
      </div>

      <div class="glass-card rounded-3xl overflow-hidden">
        <table class="w-full text-left">
          <thead class="bg-white/5 border-b border-white/10">
            <tr>
              <th class="p-6 text-xs uppercase tracking-widest text-gray-500">Category</th>
              <th class="p-6 text-xs uppercase tracking-widest text-gray-500">Status</th>
              <th class="p-6 text-xs uppercase tracking-widest text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${INITIAL_STATE.categories.map(cat => `
              <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td class="p-6">
                  <div class="flex items-center gap-4">
                    <span class="text-2xl">${cat.emoji}</span>
                    <div>
                      <div class="font-bold">${cat.name}</div>
                      <div class="text-xs text-gray-500">/#/vote/${cat.slug}</div>
                    </div>
                  </div>
                </td>
                <td class="p-6">
                  <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${cat.isOpen ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-500'}">
                    ${cat.isOpen ? 'Open' : 'Closed'}
                  </span>
                </td>
                <td class="p-6">
                  <div class="flex gap-4">
                    <a href="#/admin/nominees/${cat.id}" class="text-xs text-blue-400 hover:underline">Manage Nominees</a>
                    <button onclick="copyVoteLink('${cat.slug}')" class="text-xs text-gold hover:underline">Copy Link</button>
                    <button onclick="toggleCategoryStatus('${cat.id}')" class="text-xs text-yellow-500 hover:underline">Toggle</button>
                    <button onclick="deleteCategory('${cat.id}')" class="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('')}
            ${INITIAL_STATE.categories.length === 0 ? '<tr><td colspan="3" class="p-20 text-center text-gray-500">No categories found. Click "New Category" to start.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Category Modal -->
    <div id="modal-backdrop" class="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] hidden flex items-center justify-center p-4">
        <div class="glass-card w-full max-w-lg p-8 rounded-3xl">
          <h2 class="text-2xl font-display text-gold mb-6" id="modal-title">New Category</h2>
          <form onsubmit="handleCategoryAction(event)" id="category-form">
            <input type="hidden" id="edit-cat-id">
            <div class="grid grid-cols-4 gap-4 mb-4">
              <div class="col-span-1">
                <label class="block text-xs uppercase mb-1 font-bold">Emoji</label>
                <input type="text" id="cat-emoji" placeholder="🏆" class="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-gold">
              </div>
              <div class="col-span-3">
                <label class="block text-xs uppercase mb-1 font-bold">Name</label>
                <input type="text" id="cat-name" required placeholder="Most Likely to..." class="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-gold">
              </div>
            </div>
            <div class="mb-4">
              <label class="block text-xs uppercase mb-1 font-bold">Description</label>
              <textarea id="cat-desc" class="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-gold h-20" placeholder="A short description for this award..."></textarea>
            </div>
            <div class="flex justify-end gap-4">
              <button type="button" onclick="hideCategoryModal()" class="btn-outline !py-2 !px-6 !text-xs">Cancel</button>
              <button type="submit" class="btn-gold !py-2 !px-6 !text-xs">Save Category</button>
            </div>
          </form>
        </div>
    </div>
  `);
}

function renderAdminNominees(catId: string) {
  const cat = INITIAL_STATE.categories.find(c => c.id === catId);
  if (!cat) { window.location.hash = '#/admin/dashboard'; return; }
  
  const nominees = INITIAL_STATE.nominees.filter(n => n.categoryId === catId);

  render(`
    ${Navbar(true)}
    <div class="max-w-6xl mx-auto px-6 py-12">
      <header class="mb-12">
        <div class="flex items-center gap-4 mb-4">
            <a href="#/admin/dashboard" class="text-gold text-sm">&larr; Dashboard</a>
        </div>
        <h1 class="text-4xl font-bold">Nominees for: <span class="text-gold font-display">${cat.name}</span></h1>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <!-- Nominee Form -->
        <div class="lg:col-span-1">
          <div class="glass-card p-6 rounded-2xl sticky top-24">
            <h2 class="text-xl font-display text-gold mb-6">Add Nominee</h2>
            <form onsubmit="handleNomineeAdd(event, '${catId}')">
              <div class="mb-4">
                <label class="block text-xs uppercase mb-1 font-bold">Full Name</label>
                <input type="text" id="nom-name" required placeholder="John Doe" class="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-gold text-sm">
              </div>
              <div class="mb-4">
                <label class="block text-xs uppercase mb-1 font-bold">Photo URL</label>
                <input type="url" id="nom-photo" required placeholder="https://..." class="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-gold text-sm">
              </div>
              <div class="mb-6">
                <label class="block text-xs uppercase mb-1 font-bold">Tagline</label>
                <input type="text" id="nom-tagline" required placeholder="The legend of..." class="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-gold text-sm">
              </div>
              <button type="submit" class="w-full btn-gold !py-3">Add to Nominees</button>
            </form>
          </div>
        </div>

        <!-- Nominee List -->
        <div class="lg:col-span-2">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${nominees.map(n => `
              <div class="glass-card p-4 rounded-2xl flex items-center gap-4 group">
                <img src="${n.photoUrl}" class="w-20 h-20 rounded-xl object-cover grayscale group-hover:grayscale-0 transition-all" onerror="this.src='https://ui-avatars.com/api/?name=${n.name}'">
                <div class="flex-grow min-w-0">
                  <div class="font-bold truncate">${n.name}</div>
                  <div class="text-[10px] text-gray-500 truncate italic">"${n.tagline}"</div>
                </div>
                <button onclick="deleteNominee('${n.id}')" class="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all" title="Delete">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
            `).join('')}
            ${nominees.length === 0 ? '<div class="col-span-full p-20 glass-card text-center text-gray-500 rounded-3xl">No nominees added yet.</div>' : ''}
          </div>
        </div>
      </div>
    </div>
  `);
}

function renderAdminResults() {
  const results = INITIAL_STATE.categories.map(cat => {
    const nominees = INITIAL_STATE.nominees.filter(n => n.categoryId === cat.id);
    const nomineeStats = nominees.map(n => ({
      ...n,
      votes: INITIAL_STATE.votes.filter(v => v.nomineeId === n.id).length
    })).sort((a, b) => b.votes - a.votes);
    
    const totalVotes = INITIAL_STATE.votes.filter(v => v.categoryId === cat.id).length;
    
    return { ...cat, nominees: nomineeStats, totalVotes };
  });

  render(`
    ${Navbar(true)}
    <div class="max-w-5xl mx-auto px-6 py-12">
      <header class="flex justify-between items-center mb-12">
        <h1 class="text-4xl font-bold font-display">Election Results 🗳️</h1>
        <button onclick="exportResultsCSV()" class="btn-outline !py-2 !px-6 text-sm">Export CSV</button>
      </header>

      <div class="space-y-12">
        ${results.map(cat => `
          <div class="glass-card p-8 rounded-3xl">
            <div class="flex justify-between items-end mb-8 border-b border-white/5 pb-4">
              <div>
                <h2 class="text-2xl font-bold flex items-center gap-2">${cat.emoji} ${cat.name}</h2>
                <p class="text-gray-500 text-sm mt-1">${cat.description}</p>
              </div>
              <div class="text-right">
                <span class="text-3xl font-display text-gold">${cat.totalVotes}</span>
                <p class="text-[10px] uppercase tracking-widest text-gray-500">Total Votes</p>
              </div>
            </div>

            <div class="space-y-6">
              ${cat.nominees.map((n, i) => {
                const percentage = cat.totalVotes > 0 ? (n.votes / cat.totalVotes) * 100 : 0;
                return `
                  <div>
                    <div class="flex justify-between items-center mb-2">
                       <div class="flex items-center gap-3">
                         ${i === 0 && n.votes > 0 ? '<span class="text-xl">🏆</span>' : i === 1 && n.votes > 0 ? '<span class="text-xl">🥈</span>' : '<span class="w-6"></span>'}
                         <span class="font-semibold ${i === 0 && n.votes > 0 ? 'text-gold' : ''}">${n.name}</span>
                       </div>
                       <span class="text-sm font-mono">${n.votes} votes (${percentage.toFixed(1)}%)</span>
                    </div>
                    <div class="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                      <div class="h-full bg-gradient-to-r ${i === 0 ? 'from-[#FFD700] to-yellow-600' : 'from-[#7c3aed] to-purple-800'} transition-all duration-1000" style="width: ${percentage}%"></div>
                    </div>
                  </div>
                `;
              }).join('')}
              ${cat.nominees.length === 0 ? '<p class="text-center p-8 text-gray-600 italic">No candidates to show.</p>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `);
}

// --- EVENT HANDLERS ---

const handleLogin = (e: Event) => {
  e.preventDefault();
  const passwordInput = $('password') as HTMLInputElement;
  if (passwordInput.value === '0x68656865') {
    INITIAL_STATE.adminLoggedIn = true;
    saveStateLocal();
    window.location.hash = '#/admin/dashboard';
  } else {
    alert('Invalid Access Key. Access Denied.');
  }
};

const logoutAdmin = () => {
  INITIAL_STATE.adminLoggedIn = false;
  saveStateLocal();
  window.location.hash = '#/';
};

const showCategoryModal = () => {
  const modal = $('modal-backdrop');
  if (modal) modal.classList.remove('hidden');
  const title = $('modal-title');
  if (title) title.innerText = 'New Category';
  const form = $('category-form') as HTMLFormElement;
  if (form) form.reset();
  const idInput = $('edit-cat-id') as HTMLInputElement;
  if (idInput) idInput.value = '';
};

const hideCategoryModal = () => {
  const modal = $('modal-backdrop');
  if (modal) modal.classList.add('hidden');
};

const handleCategoryAction = async (e: Event) => {
  e.preventDefault();
  const idInput = $('edit-cat-id') as HTMLInputElement;
  const nameInput = $('cat-name') as HTMLInputElement;
  const emojiInput = $('cat-emoji') as HTMLInputElement;
  const descInput = $('cat-desc') as HTMLTextAreaElement;
  
  const id = idInput.value;
  const name = nameInput.value;
  const emoji = emojiInput.value || '🏆';
  const description = descInput.value;
  const slug = slugify(name);
  
  const submitBtn = (e.target as HTMLFormElement).querySelector('[type="submit"]') as HTMLButtonElement;
  const originalText = submitBtn.innerText;
  submitBtn.innerText = 'Saving...';
  submitBtn.disabled = true;

  try {
    if (id) {
       // edit
       if (supabase) {
         await supabase.from('categories').update({ name, slug, description, emoji }).eq('id', id);
       }
    } else {
       const newId = generateUUID();
       if (supabase) {
         await supabase.from('categories').insert({
           id: newId, name, slug, description, emoji, is_open: true
         });
       }
    }
    await loadDataFromSupabase();
    hideCategoryModal();
  } catch (err) {
    console.error(err);
    alert('Failed to save category');
  } finally {
    submitBtn.innerText = originalText;
    submitBtn.disabled = false;
  }
};

const deleteCategory = async (id: string) => {
  if (confirm('Delete this category and all its nominees/votes? This cannot be undone.')) {
    if (supabase) await supabase.from('categories').delete().eq('id', id);
    await loadDataFromSupabase();
  }
};

const toggleCategoryStatus = async (id: string) => {
  const cat = INITIAL_STATE.categories.find(c => c.id === id);
  if (cat) {
    if (supabase) await supabase.from('categories').update({ is_open: !cat.isOpen }).eq('id', id);
    await loadDataFromSupabase();
  }
};

const copyVoteLink = (slug: string) => {
  const link = `${window.location.origin}${window.location.pathname}#/vote/${slug}`;
  navigator.clipboard.writeText(link).then(() => {
    alert('Vote link copied to clipboard!');
  });
};

const handleNomineeAdd = async (e: Event, catId: string) => {
  e.preventDefault();
  const nameInput = $('nom-name') as HTMLInputElement;
  const photoInput = $('nom-photo') as HTMLInputElement;
  const taglineInput = $('nom-tagline') as HTMLInputElement;
  
  const submitBtn = (e.target as HTMLFormElement).querySelector('[type="submit"]') as HTMLButtonElement;
  const originalText = submitBtn.innerText;
  submitBtn.innerText = 'Adding...';
  submitBtn.disabled = true;

  try {
    if (supabase) {
      await supabase.from('nominees').insert({
        id: generateUUID(),
        category_id: catId,
        name: nameInput.value,
        photo_url: photoInput.value,
        tagline: taglineInput.value
      });
    }
    await loadDataFromSupabase();
    renderAdminNominees(catId);
  } catch(err) {
    console.error(err);
    alert('Failed to add nominee');
  } finally {
    submitBtn.innerText = originalText;
    submitBtn.disabled = false;
  }
};

const deleteNominee = async (id: string) => {
  if (confirm('Remove this nominee?')) {
    const nom = INITIAL_STATE.nominees.find(n => n.id === id);
    if (supabase) await supabase.from('nominees').delete().eq('id', id);
    await loadDataFromSupabase();
    if (nom) renderAdminNominees(nom.categoryId);
  }
};

let selectedNomineeId: string | null = null;
const selectNominee = (id: string) => {
  selectedNomineeId = id;
  document.querySelectorAll('.nominee-card').forEach(el => {
    el.classList.remove('border-4', 'border-gold', 'ring-4', 'ring-gold/20');
    el.querySelector('.vote-indicator')?.classList.replace('opacity-100', 'opacity-0');
  });
  
  const selectedEl = $(`nominee-${id}`);
  selectedEl?.classList.add('border-4', 'border-gold', 'ring-4', 'ring-gold/20');
  selectedEl?.querySelector('.vote-indicator')?.classList.replace('opacity-0', 'opacity-100');
  
  $('vote-footer')?.classList.remove('translate-y-full');
};

const castVote = async (catId: string) => {
  if (!selectedNomineeId) return;
  
  const btn = $('cast-vote-btn') as HTMLButtonElement;
  if (btn) {
    btn.innerText = 'PROCESSING...';
    btn.disabled = true;
  }
  
  try {
    if (supabase) {
       const { error } = await supabase.from('votes').insert({
         category_id: catId,
         nominee_id: selectedNomineeId,
         voter_id: VOTER_ID
       });
       
       if (error) {
         if (error.code === '23505') {
            alert('You have already voted in this category!');
         } else {
            alert('Failed to cast vote. Try again.');
         }
         return;
       }
    }
    
    // Update local immediately for snappy UI
    INITIAL_STATE.userVotes[catId] = selectedNomineeId;
    saveStateLocal();
    await loadDataFromSupabase();
    
    // Confetti!
    (window as any).confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FFD700', '#7c3aed', '#ffffff']
    });
    
    setTimeout(() => {
      const cat = INITIAL_STATE.categories.find(c => c.id === catId);
      renderVotePage(cat?.slug || '');
    }, 500);

  } catch (err) {
    console.error(err);
  } finally {
     if (btn) {
      btn.innerText = 'CAST YOUR VOTE';
      btn.disabled = false;
    }
  }
};

const exportResultsCSV = () => {
  let csv = 'Category,Nominee,Votes\n';
  INITIAL_STATE.categories.forEach(cat => {
    const noms = INITIAL_STATE.nominees.filter(n => n.categoryId === cat.id);
    noms.forEach(n => {
      const voteCount = INITIAL_STATE.votes.filter(v => v.nomineeId === n.id).length;
      csv += `"${cat.name}","${n.name}",${voteCount}\n`;
    });
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'farewell_results.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// Expose to window for HTML onclick handlers
Object.assign(window, {
  handleLogin, logoutAdmin, showCategoryModal, hideCategoryModal,
  handleCategoryAction, deleteCategory, toggleCategoryStatus,
  copyVoteLink, handleNomineeAdd, deleteNominee, selectNominee,
  castVote, exportResultsCSV
});

// --- START APP ---
loadDataFromSupabase().then(() => {
  // routes will be called by loadDataFromSupabase
});
