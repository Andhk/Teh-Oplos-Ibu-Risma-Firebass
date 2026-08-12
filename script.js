import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, addDoc, Timestamp } from "firebase/firestore";
// KONFIGURASI FIREBASE ANDA
const firebaseConfig = {
  apiKey: "AIzaSyD9EW1tLul16msN5LZbeV4LE77LwMZuZ5M",
  authDomain: "sistem-kasir-79fd1.firebaseapp.com",
  databaseURL: "https://sistem-kasir-79fd1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sistem-kasir-79fd1",
  storageBucket: "sistem-kasir-79fd1.firebasestorage.app",
  messagingSenderId: "237503599738",
  appId: "1:237503599738:web:4836a4c0c7f3d0c72ad7c3"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app); // Firestore DB

async function simpanData(inputUser) {
  // Hitung waktu kedaluwarsa (misalnya 24 jam dari sekarang)
  const waktuHapus = new Date();
  waktuHapus.setHours(waktuHapus.getHours() + 24);

  try {
    // Menyimpan ke collection "pesanan" (atau nama collection Anda)
    const docRef = await addDoc(collection(db, "pesanan"), {
      dataInput: inputUser,
      createdAt: Timestamp.now(),
      expireAt: Timestamp.fromDate(waktuHapus) // Field pemicu TTL
    });
    console.log("Data berhasil disimpan dengan ID: ", docRef.id);
  } catch (e) {
    console.error("Gagal menyimpan data: ", e);
  }
}

// State Lokal
let modalBalance = 0;
let stock = { cupBesar: 0, cupKecil: 0, kopi: 0, creamer: 0 };
let cart = [];
let transactions = [];

// Chart Instances
let hourlyChartInstance = null;
let stockChartInstance = null;
let dailyChartInstance = null;

// Expose fungsi ke Window agar bisa diklik di HTML
window.switchPage = switchPage;
window.addModal = addModal;
window.editStock = editStock;
window.addToCart = addToCart;
window.updateCartQty = updateCartQty;
window.processPayment = processPayment;
window.addExpense = addExpense;
window.exportToCSV = exportToCSV;

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  listenToDatabase(); // Real-time listener dari Firebase
});

// Listener Firebase: Dijalankan otomatis setiap kali data di server berubah
function listenToDatabase() {
  const storeRef = ref(db, 'teh_oplos_store');
  onValue(storeRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      modalBalance = data.modalBalance || 0;
      stock = data.stock || { cupBesar: 0, cupKecil: 0, kopi: 0, creamer: 0 };
      transactions = data.transactions || [];

      // Update Seluruh UI
      updateModalUI();
      updateStockUI();
      renderTransactionHistory();
      updateHourlyChart();
      
      const statsPage = document.getElementById('page-stats');
      if (statsPage.classList.contains('active-page')) {
        updateStatsDashboard();
      }
    }
  });
}

// Simpan Data Terbaru ke Firebase
function saveDataToFirebase() {
  set(ref(db, 'teh_oplos_store'), {
    modalBalance: modalBalance,
    stock: stock,
    transactions: transactions
  });
}

// Navigasi Halaman
function switchPage(pageId) {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active-page'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  if (pageId === 'pos') {
    document.getElementById('page-pos').classList.add('active-page');
    event.target.classList.add('active');
  } else {
    document.getElementById('page-stats').classList.add('active-page');
    event.target.classList.add('active');
    updateStatsDashboard();
  }
}

// Deposit Modal Awal
function addModal(event) {
  event.preventDefault();
  const modalInput = document.getElementById('modal-input');
  const amount = parseInt(modalInput.value);

  if (!isNaN(amount) && amount > 0) {
    modalBalance += amount;

    const now = new Date();
    transactions.unshift({
      id: Date.now(),
      type: 'Deposit Modal',
      timeString: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      dateString: now.toISOString().split('T')[0],
      details: 'Deposit Modal Operasional Owner',
      method: 'Tunai',
      totalTeh: 0,
      totalNonTeh: 0,
      grandTotal: amount
    });

    saveDataToFirebase();
    modalInput.value = '';
    alert(`Deposit modal berhasil ditambahkan sebesar Rp ${amount.toLocaleString('id-ID')}`);
  }
}

function updateModalUI() {
  document.getElementById('display-modal-balance').textContent = `Rp ${modalBalance.toLocaleString('id-ID')}`;
}

function updateStockUI() {
  document.getElementById('stock-cup-besar').textContent = stock.cupBesar;
  document.getElementById('stock-cup-kecil').textContent = stock.cupKecil;
  document.getElementById('stock-kopi').textContent = stock.kopi;
  document.getElementById('stock-creamer').textContent = stock.creamer;
  if (stockChartInstance) updateStockChart();
}

function editStock(itemKey, mode) {
  const isAdd = mode === 'add';
  const label = isAdd ? 'tambahan' : 'pengurangan';
  const inputVal = prompt(`Masukkan jumlah ${label} stok untuk ${itemKey}:`, "5");
  const qty = parseInt(inputVal);

  if (!isNaN(qty) && qty > 0) {
    if (isAdd) {
      stock[itemKey] += qty;
    } else {
      if (stock[itemKey] - qty < 0) {
        alert('Pengurangan melebihi sisa stok yang ada!');
        return;
      }
      stock[itemKey] -= qty;
    }
    saveDataToFirebase();
  }
}

// Keranjang
function addToCart(name, price, category, stockRequirement) {
  for (let key in stockRequirement) {
    if (stock[key] < stockRequirement[key]) {
      alert(`Stok ${key} tidak mencukupi!`);
      return;
    }
  }

  const existingItem = cart.find(item => item.name === name);
  if (existingItem) {
    existingItem.qty += 1;
  } else {
    cart.push({
      name: name,
      price: price,
      category: category,
      qty: 1,
      stockReq: stockRequirement
    });
  }

  renderCart();
}

function updateCartQty(index, change) {
  cart[index].qty += change;
  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  }
  renderCart();
}

function renderCart() {
  const cartContainer = document.getElementById('cart-list');
  cartContainer.innerHTML = '';

  if (cart.length === 0) {
    cartContainer.innerHTML = '<p class="empty-cart">Keranjang masih kosong</p>';
    document.getElementById('subtotal-teh').textContent = 'Rp 0';
    document.getElementById('subtotal-non-teh').textContent = 'Rp 0';
    document.getElementById('grand-total').textContent = 'Rp 0';
    return;
  }

  let totalTeh = 0;
  let totalNonTeh = 0;

  cart.forEach((item, index) => {
    const itemTotal = item.price * item.qty;
    if (item.category === 'teh') totalTeh += itemTotal;
    else totalNonTeh += itemTotal;

    const itemEl = document.createElement('div');
    itemEl.className = 'cart-item';
    itemEl.innerHTML = `
      <div>
        <div class="cart-item-title">${item.name}</div>
        <small>Rp ${item.price.toLocaleString('id-ID')} x ${item.qty}</small>
      </div>
      <div class="cart-item-controls">
        <button class="btn-sm btn-reduce" onclick="updateCartQty(${index}, -1)">-</button>
        <span>${item.qty}</span>
        <button class="btn-sm btn-add" onclick="updateCartQty(${index}, 1)">+</button>
      </div>
    `;
    cartContainer.appendChild(itemEl);
  });

  const grandTotal = totalTeh + totalNonTeh;

  document.getElementById('subtotal-teh').textContent = `Rp ${totalTeh.toLocaleString('id-ID')}`;
  document.getElementById('subtotal-non-teh').textContent = `Rp ${totalNonTeh.toLocaleString('id-ID')}`;
  document.getElementById('grand-total').textContent = `Rp ${grandTotal.toLocaleString('id-ID')}`;
}

// Proses Pembayaran
function processPayment() {
  if (cart.length === 0) {
    alert('Keranjang belanja kosong!');
    return;
  }

  let tempStock = { ...stock };
  for (let item of cart) {
    for (let key in item.stockReq) {
      const requiredQty = item.stockReq[key] * item.qty;
      if (tempStock[key] < requiredQty) {
        alert(`Stok ${key} tidak mencukupi!`);
        return;
      }
      tempStock[key] -= requiredQty;
    }
  }

  stock = tempStock;

  let totalTeh = 0;
  let totalNonTeh = 0;
  let itemDetails = [];

  cart.forEach(item => {
    const sub = item.price * item.qty;
    if (item.category === 'teh') totalTeh += sub;
    else totalNonTeh += sub;
    itemDetails.push(`${item.name} (${item.qty})`);
  });

  const paymentMethod = document.getElementById('payment-method').value;
  const now = new Date();

  transactions.unshift({
    id: Date.now(),
    type: 'Penjualan',
    timeString: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    dateString: now.toISOString().split('T')[0],
    details: itemDetails.join(', '),
    method: paymentMethod,
    totalTeh: totalTeh,
    totalNonTeh: totalNonTeh,
    grandTotal: totalTeh + totalNonTeh
  });

  cart = [];
  renderCart();
  saveDataToFirebase();
  alert('Transaksi berhasil disimpan!');
}

// Tambah Pengeluaran Operasional
function addExpense(event) {
  event.preventDefault();
  const name = document.getElementById('expense-name').value;
  const amount = parseInt(document.getElementById('expense-amount').value);

  if (!name || isNaN(amount) || amount <= 0) return;

  if (modalBalance < amount) {
    alert(`Sisa kas modal tidak mencukupi! Sisa modal: Rp ${modalBalance.toLocaleString('id-ID')}`);
    return;
  }

  modalBalance -= amount;

  const now = new Date();
  transactions.unshift({
    id: Date.now(),
    type: 'Pengeluaran',
    timeString: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    dateString: now.toISOString().split('T')[0],
    details: name,
    method: 'Kas Modal',
    totalTeh: 0,
    totalNonTeh: 0,
    grandTotal: amount
  });

  document.getElementById('expense-form').reset();
  saveDataToFirebase();
  alert(`Pengeluaran sebesar Rp ${amount.toLocaleString('id-ID')} dicatat.`);
}

function renderTransactionHistory() {
  const tbody = document.getElementById('transaction-history');
  tbody.innerHTML = '';

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Belum ada transaksi.</td></tr>';
    return;
  }

  transactions.forEach(t => {
    const tr = document.createElement('tr');
    let typeClass = 'text-success';
    let prefix = '';

    if (t.type === 'Pengeluaran') {
      typeClass = 'text-danger';
      prefix = '-';
    } else if (t.type === 'Deposit Modal') {
      typeClass = 'text-primary';
      prefix = '+';
    }
    
    tr.innerHTML = `
      <td>${t.timeString}</td>
      <td><span class="${typeClass}">${t.type}</span></td>
      <td>${t.details}</td>
      <td>${t.method}</td>
      <td><strong>${prefix}Rp ${t.grandTotal.toLocaleString('id-ID')}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

// FITUR EXPORT CSV UNTUK EXCEL
function exportToCSV() {
  if (transactions.length === 0) {
    alert('Belum ada data transaksi untuk diexport!');
    return;
  }

  let csvContent = "\uFEFF"; // Byte Order Mark (BOM) agar format UTF-8 & simbol Excel terbaca baik
  csvContent += "Tanggal,Waktu,Tipe Transaksi,Rincian,Metode Pembayaran,Total (Rp)\n";

  transactions.forEach(t => {
    const detailsClean = `"${t.details.replace(/"/g, '""')}"`;
    const row = [
      t.dateString,
      t.timeString,
      t.type,
      detailsClean,
      t.method,
      t.grandTotal
    ].join(",");
    csvContent += row + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  const today = new Date().toISOString().split('T')[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `Laporan_Teh_Oplos_Ibu_Risma_${today}.csv`);
  document.body.appendChild(link);
  
  link.click();
  document.body.removeChild(link);
}

// Chart initialization
function initCharts() {
  const ctxHourly = document.getElementById('hourlyChart').getContext('2d');
  hourlyChartInstance = new Chart(ctxHourly, {
    type: 'line',
    data: {
      labels: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
      datasets: [{
        label: 'Omset Penjualan (Rp)',
        data: [0, 0, 0, 0, 0, 0, 0],
        borderColor: '#2e7d32',
        backgroundColor: 'rgba(46, 125, 50, 0.1)',
        fill: true,
        tension: 0.3
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
  });

  const ctxStock = document.getElementById('stockChart').getContext('2d');
  stockChartInstance = new Chart(ctxStock, {
    type: 'bar',
    data: {
      labels: ['Cup Besar', 'Cup Kecil', 'Kopi', 'Creamer'],
      datasets: [{
        label: 'Sisa Stok Units',
        data: [0, 0, 0, 0],
        backgroundColor: ['#2e7d32', '#66bb6a', '#d84315', '#ffb74d']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
  });

  const ctxDaily = document.getElementById('dailyChart').getContext('2d');
  dailyChartInstance = new Chart(ctxDaily, {
    type: 'bar',
    data: {
      labels: ['Hari Ini'],
      datasets: [
        { label: 'Teh (Rp)', data: [0], backgroundColor: '#2e7d32' },
        { label: 'Kopi/Jajanan (Rp)', data: [0], backgroundColor: '#d84315' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
  });
}

function updateHourlyChart() {
  const hourlyData = Array(7).fill(0);
  const timeBuckets = [8, 10, 12, 14, 16, 18, 20];
  const todayStr = new Date().toISOString().split('T')[0];

  transactions.forEach(t => {
    if (t.type === 'Penjualan' && t.dateString === todayStr) {
      const hour = parseInt(t.timeString.split(':')[0]);
      let index = timeBuckets.findIndex(h => hour <= h);
      if (index === -1) index = timeBuckets.length - 1;
      hourlyData[index] += t.grandTotal;
    }
  });

  hourlyChartInstance.data.datasets[0].data = hourlyData;
  hourlyChartInstance.update();
}

function updateStockChart() {
  stockChartInstance.data.datasets[0].data = [
    stock.cupBesar,
    stock.cupKecil,
    stock.kopi,
    stock.creamer
  ];
  stockChartInstance.update();
}

function updateStatsDashboard() {
  let totalTeh = 0;
  let totalNonTeh = 0;
  let totalExpense = 0;

  transactions.forEach(t => {
    if (t.type === 'Penjualan') {
      totalTeh += t.totalTeh;
      totalNonTeh += t.totalNonTeh;
    } else if (t.type === 'Pengeluaran') {
      totalExpense += t.grandTotal;
    }
  });

  document.getElementById('stat-modal-balance').textContent = `Rp ${modalBalance.toLocaleString('id-ID')}`;
  document.getElementById('stat-total-teh').textContent = `Rp ${totalTeh.toLocaleString('id-ID')}`;
  document.getElementById('stat-total-non-teh').textContent = `Rp ${totalNonTeh.toLocaleString('id-ID')}`;
  document.getElementById('stat-total-expense').textContent = `Rp ${totalExpense.toLocaleString('id-ID')}`;

  dailyChartInstance.data.datasets[0].data = [totalTeh];
  dailyChartInstance.data.datasets[1].data = [totalNonTeh];
  dailyChartInstance.update();

  updateStockChart();
}
