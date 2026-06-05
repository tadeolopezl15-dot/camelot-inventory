import React, { useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Boxes, Building2, ClipboardList, Download, FileSpreadsheet, LayoutDashboard, LogOut, PackageMinus, PackagePlus, Printer, Repeat2, Search, Settings, ShieldCheck, Truck, Users, Warehouse } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import './styles.css';
import { supabase } from './supabase';

const menu = [
  ['Dashboard', LayoutDashboard],
  ['Products', Boxes],
  ['Inventory', Warehouse],
  ['Stock In', PackagePlus],
  ['Stock Out', PackageMinus],
  ['Daily Use', ClipboardList],
  ['Transfers', Repeat2],
  ['Reports', ClipboardList],
  ['Suppliers', Truck],
  ['Customers', Users],
  ['Users', ShieldCheck],
  ['Settings', Settings]
];

function todayText() {
  return new Date().toLocaleString('en-US');
}

function App() {
  const [active, setActive] = useState('Dashboard');
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [query, setQuery] = useState('');
  const [reportType, setReportType] = useState('executive');
  const [form, setForm] = useState({
    productId: '',
    qty: 1,
    warehouse: 'Warehouse 1',
    destination: '',
    notes: ''
  });

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      alert(error.message);
      return;
    }

    const formatted = (data || []).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category || 'General',
      unit: p.unit || 'units',
      min: Number(p.min_stock || 0),
      w1: Number(p.w1 || 0),
      w2: Number(p.w2 || 0)
    }));

    setProducts(formatted);

    if (formatted.length > 0) {
      setForm((prev) => ({
        ...prev,
        productId: prev.productId || formatted[0].id
      }));
    }
  }

  async function addProduct() {
    const code = prompt('Product Code');
    if (!code) return;

    const name = prompt('Product Name');
    if (!name) return;

    const category = prompt('Category', 'General') || 'General';
    const unit = prompt('Unit', 'units') || 'units';
    const minStock = prompt('Minimum Stock', '0') || '0';
    const w1 = prompt('Warehouse 1 Stock', '0') || '0';
    const w2 = prompt('Warehouse 2 Stock', '0') || '0';

    const { error } = await supabase.from('products').insert({
      code,
      name,
      category,
      unit,
      min_stock: Number(minStock),
      w1: Number(w1),
      w2: Number(w2)
    });

    if (error) return alert(error.message);
    await loadProducts();
  }

  async function editProduct(product) {
    const code = prompt('Product Code', product.code);
    if (!code) return;

    const name = prompt('Product Name', product.name);
    if (!name) return;

    const category = prompt('Category', product.category) || 'General';
    const unit = prompt('Unit', product.unit) || 'units';
    const minStock = prompt('Minimum Stock', product.min) || '0';
    const w1 = prompt('Warehouse 1 Stock', product.w1) || '0';
    const w2 = prompt('Warehouse 2 Stock', product.w2) || '0';

    const { error } = await supabase
      .from('products')
      .update({
        code,
        name,
        category,
        unit,
        min_stock: Number(minStock),
        w1: Number(w1),
        w2: Number(w2)
      })
      .eq('id', product.id);

    if (error) return alert(error.message);
    await loadProducts();
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) return alert(error.message);
    await loadProducts();
  }

  const totals = useMemo(() => {
    const w1 = products.reduce((s, p) => s + Number(p.w1 || 0), 0);
    const w2 = products.reduce((s, p) => s + Number(p.w2 || 0), 0);

    return {
      products: products.length,
      w1,
      w2,
      all: w1 + w2,
      low: products.filter((p) => Number(p.w1 || 0) + Number(p.w2 || 0) <= Number(p.min || 0)).length
    };
  }, [products]);

  async function addMovement(type) {
    const product = products.find((p) => p.id === Number(form.productId));
    const qty = Number(form.qty || 0);

    if (!product || qty <= 0) return;

    let updated = { ...product };
    let from = '';
    let to = '';

    if (type === 'Stock In') {
      to = form.warehouse;
      const key = form.warehouse === 'Warehouse 1' ? 'w1' : 'w2';
      updated[key] = Number(updated[key] || 0) + qty;
    }

    if (type === 'Stock Out') {
      from = form.warehouse;
      to = form.destination || 'Job Site';
      const key = form.warehouse === 'Warehouse 1' ? 'w1' : 'w2';
      updated[key] = Math.max(0, Number(updated[key] || 0) - qty);
    }

    if (type === 'Daily Use') {
      from = 'Warehouse 1';
      to = form.destination || 'Daily Use';
      updated.w1 = Math.max(0, Number(updated.w1 || 0) - qty);
    }

    if (type === 'Transfer') {
      from = form.warehouse;
      to = form.warehouse === 'Warehouse 1' ? 'Warehouse 2' : 'Warehouse 1';

      if (form.warehouse === 'Warehouse 1') {
        updated.w1 = Math.max(0, Number(updated.w1 || 0) - qty);
        updated.w2 = Number(updated.w2 || 0) + qty;
      } else {
        updated.w2 = Math.max(0, Number(updated.w2 || 0) - qty);
        updated.w1 = Number(updated.w1 || 0) + qty;
      }
    }

    const { error } = await supabase
      .from('products')
      .update({
        w1: updated.w1,
        w2: updated.w2
      })
      .eq('id', product.id);

    if (error) return alert(error.message);

    setMovements([
      {
        id: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        type,
        product: product.name,
        qty,
        from: from || 'Supplier',
        to,
        notes: form.notes
      },
      ...movements
    ]);

    setForm({
      ...form,
      qty: 1,
      destination: '',
      notes: ''
    });

    await loadProducts();
  }

  const lowStock = products.filter((p) => Number(p.w1 || 0) + Number(p.w2 || 0) <= Number(p.min || 0));
  const dailyUse = movements.filter((m) => m.type === 'Daily Use');
  const stockIn = movements.filter((m) => m.type === 'Stock In');
  const stockOut = movements.filter((m) => m.type === 'Stock Out');
  const transfers = movements.filter((m) => m.type === 'Transfer');


  function getReportTitle() {
    const titles = {
      executive: 'Executive Inventory Report',
      inventory: 'Inventory Report',
      warehouse1: 'Warehouse 1 Report',
      warehouse2: 'Warehouse 2 Report',
      dailyuse: 'Daily Use Report',
      stockin: 'Stock In Report',
      stockout: 'Stock Out Report',
      transfers: 'Transfers Report',
      lowstock: 'Low Stock Report'
    };

    return titles[reportType] || 'Inventory Report';
  }

  function getSelectedProductRows() {
    if (reportType === 'warehouse1') return products.filter((p) => Number(p.w1 || 0) > 0);
    if (reportType === 'warehouse2') return products.filter((p) => Number(p.w2 || 0) > 0);
    if (reportType === 'lowstock') return lowStock;
    if (reportType === 'inventory') return products;
    if (reportType === 'executive') return products;
    return [];
  }

  function getSelectedMovementRows() {
    if (reportType === 'dailyuse') return dailyUse;
    if (reportType === 'stockin') return stockIn;
    if (reportType === 'stockout') return stockOut;
    if (reportType === 'transfers') return transfers;
    if (reportType === 'executive') return movements;
    return [];
  }

  function exportExcel() {
    const title = getReportTitle();
    const productRows = getSelectedProductRows().map((p) => ({
      Code: p.code,
      Product: p.name,
      Category: p.category,
      Unit: p.unit,
      'Warehouse 1': p.w1,
      'Warehouse 2': p.w2,
      Total: Number(p.w1 || 0) + Number(p.w2 || 0),
      Status: Number(p.w1 || 0) + Number(p.w2 || 0) <= Number(p.min || 0) ? 'Low Stock' : 'OK'
    }));

    const movementRows = getSelectedMovementRows().map((m) => ({
      Date: m.date,
      Type: m.type,
      Product: m.product,
      Quantity: m.qty,
      From: m.from,
      'To / Used For': m.to,
      Notes: m.notes || ''
    }));

    const summaryRows = [
      { Metric: 'Report', Value: title },
      { Metric: 'Generated', Value: todayText() },
      { Metric: 'Total Products', Value: totals.products },
      { Metric: 'Warehouse 1 Stock', Value: totals.w1 },
      { Metric: 'Warehouse 2 Stock', Value: totals.w2 },
      { Metric: 'Total Inventory', Value: totals.all },
      { Metric: 'Low Stock Items', Value: totals.low }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

    if (productRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productRows), title.slice(0, 31));
    }

    if (movementRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(movementRows), 'Movements');
    }

    if (productRows.length === 0 && movementRows.length === 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Message: 'No records found.' }]), 'Report');
    }

    XLSX.writeFile(wb, `${title.toLowerCase().replaceAll(' ', '-')}.xlsx`);
  }

  function exportPDF() {
    const title = getReportTitle();
    const productRows = getSelectedProductRows();
    const movementRows = getSelectedMovementRows();

    const doc = new jsPDF();
    let y = 18;

    function pageCheck() {
      if (y > 280) {
        doc.addPage();
        y = 18;
      }
    }

    doc.setFontSize(16);
    doc.text('CAMELOT INVENTORY MANAGEMENT', 14, y);
    y += 8;

    doc.setFontSize(12);
    doc.text(title.toUpperCase(), 14, y);
    y += 8;

    doc.setFontSize(9);
    doc.text(`Generated: ${todayText()}`, 14, y);
    y += 12;

    doc.setFontSize(11);
    doc.text('SUMMARY', 14, y);
    y += 8;

    doc.setFontSize(9);
    [
      `Total Products: ${totals.products}`,
      `Warehouse 1 Stock: ${totals.w1}`,
      `Warehouse 2 Stock: ${totals.w2}`,
      `Total Inventory: ${totals.all}`,
      `Low Stock Items: ${totals.low}`
    ].forEach((line) => {
      pageCheck();
      doc.text(line, 14, y);
      y += 6;
    });

    if (productRows.length > 0) {
      y += 8;
      doc.setFontSize(11);
      doc.text('PRODUCTS', 14, y);
      y += 8;

      doc.setFontSize(8);
      productRows.forEach((p) => {
        pageCheck();
        doc.text(
          `${p.code} | ${p.name} | W1: ${p.w1} | W2: ${p.w2} | Total: ${Number(p.w1 || 0) + Number(p.w2 || 0)}`,
          14,
          y
        );
        y += 6;
      });
    }

    if (movementRows.length > 0) {
      y += 8;
      doc.setFontSize(11);
      doc.text('MOVEMENTS', 14, y);
      y += 8;

      doc.setFontSize(8);
      movementRows.forEach((m) => {
        pageCheck();
        doc.text(`${m.date} | ${m.type} | ${m.product} | Qty: ${m.qty} | ${m.from} → ${m.to}`, 14, y);
        y += 6;
      });
    }

    if (productRows.length === 0 && movementRows.length === 0) {
      y += 8;
      doc.text('No records found.', 14, y);
    }

    doc.save(`${title.toLowerCase().replaceAll(' ', '-')}.pdf`);
  }

  function printReport() {
    const title = getReportTitle();
    const productRows = getSelectedProductRows();
    const movementRows = getSelectedMovementRows();

    const productTable = productRows.length > 0 ? `
      <h2>Products</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th><th>Product</th><th>Category</th><th>Unit</th><th>Warehouse 1</th><th>Warehouse 2</th><th>Total</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${productRows.map((p) => `
            <tr>
              <td>${p.code}</td>
              <td>${p.name}</td>
              <td>${p.category}</td>
              <td>${p.unit}</td>
              <td>${p.w1}</td>
              <td>${p.w2}</td>
              <td>${Number(p.w1 || 0) + Number(p.w2 || 0)}</td>
              <td>${Number(p.w1 || 0) + Number(p.w2 || 0) <= Number(p.min || 0) ? 'Low Stock' : 'OK'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    const movementTable = movementRows.length > 0 ? `
      <h2>Movements</h2>
      <table>
        <thead>
          <tr><th>Date</th><th>Type</th><th>Product</th><th>Qty</th><th>From</th><th>To / Used For</th><th>Notes</th></tr>
        </thead>
        <tbody>
          ${movementRows.map((m) => `
            <tr>
              <td>${m.date}</td><td>${m.type}</td><td>${m.product}</td><td>${m.qty}</td><td>${m.from}</td><td>${m.to}</td><td>${m.notes || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    const html = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
            h1 { font-size: 24px; margin: 0; }
            h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #d1d5db; padding-bottom: 8px; }
            p { margin: 4px 0; }
            .header { border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 24px; }
            .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
            .card { border: 1px solid #d1d5db; padding: 12px; border-radius: 8px; }
            .card strong { display: block; font-size: 20px; margin-top: 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 7px; text-align: left; }
            th { background: #f3f4f6; }
            @media print { body { padding: 18px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>CAMELOT INVENTORY MANAGEMENT</h1>
            <p>${title}</p>
            <p>Generated: ${todayText()}</p>
          </div>

          <div class="summary">
            <div class="card">Total Products<strong>${totals.products}</strong></div>
            <div class="card">Warehouse 1<strong>${totals.w1}</strong></div>
            <div class="card">Warehouse 2<strong>${totals.w2}</strong></div>
            <div class="card">Total Inventory<strong>${totals.all}</strong></div>
            <div class="card">Low Stock<strong>${totals.low}</strong></div>
          </div>

          ${productTable}
          ${movementTable}
          ${productRows.length === 0 && movementRows.length === 0 ? '<p>No records found.</p>' : ''}
        </body>
      </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
  }

  const filtered = products.filter((p) =>
    [p.name, p.code, p.category].join(' ').toLowerCase().includes(query.toLowerCase())
  );

  const chartData = products.map((p) => ({
    name: String(p.name || '').split(' ')[0],
    Warehouse1: Number(p.w1 || 0),
    Warehouse2: Number(p.w2 || 0)
  }));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">C</div>
          <div>
            <strong>CAMELOT</strong>
            <span>Inventory Management</span>
          </div>
        </div>

        <nav>
          {menu.map(([label, Icon]) => (
            <button key={label} onClick={() => setActive(label)} className={active === label ? 'active' : ''}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>

        <button className="logout">
          <LogOut size={18} /> Sign Out
        </button>
      </aside>

      <main>
        <header>
          <div>
            <p>Professional warehouse control</p>
            <h1>{active}</h1>
          </div>

          <button className="primary" onClick={addProduct}>
            + Add Product
          </button>
        </header>

        {active === 'Dashboard' && (
          <section>
            <div className="cards">
              <Card title="Total Products" value={totals.products} icon={Boxes} />
              <Card title="Total Stock" value={totals.all} icon={BarChart3} />
              <Card title="Warehouse 1" value={totals.w1} />
              <Card title="Warehouse 2" value={totals.w2} />
              <Card title="Low Stock Alerts" value={totals.low} />
            </div>

            <div className="grid">
              <Panel title="Stock by Warehouse">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="Warehouse1" />
                    <Bar dataKey="Warehouse2" />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              <Panel title="Recent Activity">
                <MovementTable rows={movements.slice(0, 6)} />
              </Panel>
            </div>
          </section>
        )}

        {['Products', 'Inventory'].includes(active) && (
          <Panel title="Inventory List">
            <button className="primary" onClick={addProduct}>Add Product</button>
            <SearchBox query={query} setQuery={setQuery} />
            <ProductTable rows={filtered} editProduct={editProduct} deleteProduct={deleteProduct} />
          </Panel>
        )}

        {['Stock In', 'Stock Out', 'Daily Use', 'Transfers'].includes(active) && (
          <Panel title={`New ${active}`}>
            <MovementForm form={form} setForm={setForm} products={products} active={active} />

            <button className="primary wide" onClick={() => addMovement(active)}>
              {active === 'Transfers' ? 'Transfer Stock' : active === 'Daily Use' ? 'Save Daily Use' : `Save ${active}`}
            </button>
          </Panel>
        )}

        {active === 'Reports' && (
          <Panel title="Reports Center">
            <div style={{ marginBottom: '20px' }}>
              <label>
                Report Type
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  style={{
                    marginLeft: '10px',
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid #d1d5db'
                  }}
                >
                  <option value="executive">Executive Report</option>
                  <option value="inventory">Inventory Report</option>
                  <option value="warehouse1">Warehouse 1 Report</option>
                  <option value="warehouse2">Warehouse 2 Report</option>
                  <option value="dailyuse">Daily Use Report</option>
                  <option value="stockin">Stock In Report</option>
                  <option value="stockout">Stock Out Report</option>
                  <option value="transfers">Transfers Report</option>
                  <option value="lowstock">Low Stock Report</option>
                </select>
              </label>
            </div>

            <div className="report-actions">
              <button onClick={exportPDF}><Download size={18} /> Export Selected PDF</button>
              <button onClick={exportExcel}><FileSpreadsheet size={18} /> Export Selected Excel</button>
              <button onClick={printReport}><Printer size={18} /> Print Selected Report</button>
            </div>

            {reportType === 'executive' && (
              <>
                <div className="cards">
                  <Card title="Total Products" value={totals.products} icon={Boxes} />
                  <Card title="Warehouse 1" value={totals.w1} />
                  <Card title="Warehouse 2" value={totals.w2} />
                  <Card title="Total Inventory" value={totals.all} />
                  <Card title="Low Stock" value={totals.low} />
                </div>

                <Panel title="Low Stock Alerts">
                  <ProductTable rows={lowStock} hideActions />
                </Panel>

                <Panel title="Recent Daily Use">
                  <MovementTable rows={dailyUse.slice(0, 10)} />
                </Panel>

                <Panel title="Recent Movements">
                  <MovementTable rows={movements.slice(0, 10)} />
                </Panel>
              </>
            )}

            {reportType === 'inventory' && (
              <Panel title="Inventory Report">
                <ProductTable rows={products} hideActions />
              </Panel>
            )}

            {reportType === 'warehouse1' && (
              <Panel title="Warehouse 1 Report">
                <ProductTable rows={products.filter((p) => Number(p.w1 || 0) > 0)} hideActions />
              </Panel>
            )}

            {reportType === 'warehouse2' && (
              <Panel title="Warehouse 2 Report">
                <ProductTable rows={products.filter((p) => Number(p.w2 || 0) > 0)} hideActions />
              </Panel>
            )}

            {reportType === 'dailyuse' && (
              <Panel title="Daily Use Report">
                <MovementTable rows={dailyUse} />
              </Panel>
            )}

            {reportType === 'stockin' && (
              <Panel title="Stock In Report">
                <MovementTable rows={stockIn} />
              </Panel>
            )}

            {reportType === 'stockout' && (
              <Panel title="Stock Out Report">
                <MovementTable rows={stockOut} />
              </Panel>
            )}

            {reportType === 'transfers' && (
              <Panel title="Transfers Report">
                <MovementTable rows={transfers} />
              </Panel>
            )}

            {reportType === 'lowstock' && (
              <Panel title="Low Stock Report">
                <ProductTable rows={lowStock} hideActions />
              </Panel>
            )}
          </Panel>
        )}

        {['Suppliers', 'Customers', 'Users', 'Settings'].includes(active) && (
          <Panel title={active}>
            <div className="empty">
              <Building2 size={44} />
              <h2>{active} module</h2>
              <p>This screen is ready for Supabase data integration, roles, permissions and online records.</p>
            </div>
          </Panel>
        )}
      </main>
    </div>
  );
}

function Card({ title, value, icon: Icon = Warehouse }) {
  return (
    <div className="card">
      <Icon size={22} />
      <p>{title}</p>
      <h2>{value}</h2>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function SearchBox({ query, setQuery }) {
  return (
    <div className="search">
      <Search size={18} />
      <input
        placeholder="Search product, code or category..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );
}

function ProductTable({ rows, editProduct, deleteProduct, hideActions = false }) {
  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Product</th>
            <th>Category</th>
            <th>Unit</th>
            <th>Warehouse 1</th>
            <th>Warehouse 2</th>
            <th>Total</th>
            <th>Status</th>
            {!hideActions && <th>Actions</th>}
          </tr>
        </thead>

        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.code}</td>
              <td>{p.name}</td>
              <td>{p.category}</td>
              <td>{p.unit}</td>
              <td>{p.w1}</td>
              <td>{p.w2}</td>
              <td>{Number(p.w1 || 0) + Number(p.w2 || 0)}</td>
              <td>
                <span className={Number(p.w1 || 0) + Number(p.w2 || 0) <= Number(p.min || 0) ? 'badge low' : 'badge'}>
                  {Number(p.w1 || 0) + Number(p.w2 || 0) <= Number(p.min || 0) ? 'Low Stock' : 'OK'}
                </span>
              </td>

              {!hideActions && (
                <td>
                  <button onClick={() => editProduct(p)}>Edit</button>
                  <button onClick={() => deleteProduct(p.id)}>Delete</button>
                </td>
              )}
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={hideActions ? 8 : 9}>No records found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MovementTable({ rows }) {
  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Product</th>
            <th>Qty</th>
            <th>From</th>
            <th>To / Used For</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>{m.date}</td>
              <td>{m.type}</td>
              <td>{m.product}</td>
              <td>{m.qty}</td>
              <td>{m.from}</td>
              <td>{m.to}</td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan="6">No records found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MovementForm({ form, setForm, products, active }) {
  return (
    <div className="form">
      <label>
        Product
        <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

      <label>
        Quantity
        <input type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
      </label>

      {active !== 'Daily Use' && (
        <label>
          {active === 'Transfers' ? 'From Warehouse' : 'Warehouse'}
          <select value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })}>
            <option>Warehouse 1</option>
            <option>Warehouse 2</option>
          </select>
        </label>
      )}

      {active === 'Daily Use' && (
        <label>
          Warehouse
          <input disabled value="Warehouse 1" />
        </label>
      )}

      {(active === 'Stock Out' || active === 'Daily Use') && (
        <label>
          Used For / Destination
          <input
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
            placeholder="Project, job site, department or daily usage"
          />
        </label>
      )}

      {active === 'Transfers' && (
        <label>
          To Warehouse
          <input disabled value={form.warehouse === 'Warehouse 1' ? 'Warehouse 2' : 'Warehouse 1'} />
        </label>
      )}

      <label className="full">
        Notes
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
      </label>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);