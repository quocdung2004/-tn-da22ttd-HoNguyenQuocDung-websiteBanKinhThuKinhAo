import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, ClipboardList, Package, User, PlusCircle, Eye, X, Loader2, AlertCircle, Search } from 'lucide-react';

export default function ImportManager() {
  const [receipts, setReceipts] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // State form nhập mới
  const [currentUser, setCurrentUser] = useState(null);
  const [note, setNote] = useState('');
  const [importItems, setImportItems] = useState([
    { productId: '', quantity: 1, importPrice: 0 }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State Modal xem chi tiết phiếu nhập
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // 2. Fetch dữ liệu từ API MongoDB
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('glassesToken');
      
      // Lấy toàn bộ sản phẩm (kể cả ẩn để Admin nhập hàng)
      const prodRes = await fetch('/api/products?all=true');
      const prodData = await prodRes.json();
      if (prodData.success) {
        setProducts(prodData.products);
      }

      // Lấy lịch sử phiếu nhập kho
      const impRes = await fetch('/api/imports', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const impData = await impRes.json();
      if (impData.success) {
        setReceipts(impData.receipts);
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu nhập kho:', err);
      setError('Không thể kết nối đến máy chủ hoặc tải dữ liệu phiếu nhập.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const userStr = localStorage.getItem('glassesUser');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        console.error('Lỗi phân tích người dùng:', e);
      }
    }
  }, []);

  // 3. Quản lý các dòng sản phẩm trong form nhập hàng
  const handleAddItemRow = () => {
    setImportItems([...importItems, { productId: '', quantity: 1, importPrice: 0 }]);
  };

  const handleRemoveItemRow = (index) => {
    if (importItems.length === 1) return;
    const newItems = importItems.filter((_, i) => i !== index);
    setImportItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...importItems];
    if (field === 'productId') {
      newItems[index].productId = value;
      // Tự động lấy giá nhập sỉ hiện hành của sản phẩm để điền làm gợi ý ban đầu
      const selectedProd = products.find(p => p._id === value);
      if (selectedProd) {
        newItems[index].importPrice = selectedProd.importPrice || 0;
      }
    } else if (field === 'quantity') {
      newItems[index].quantity = Math.max(1, parseInt(value) || 1);
    } else if (field === 'importPrice') {
      newItems[index].importPrice = Math.max(0, parseFloat(value) || 0);
    }
    setImportItems(newItems);
  };

  // 4. Submit tạo phiếu nhập kho lên MongoDB
  const handleSubmitReceipt = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    for (let i = 0; i < importItems.length; i++) {
      const item = importItems[i];
      if (!item.productId) {
        alert(`Dòng thứ ${i + 1} chưa chọn sản phẩm cần nhập!`);
        return;
      }
      if (item.quantity <= 0) {
        alert(`Dòng thứ ${i + 1}: Số lượng nhập phải lớn hơn 0!`);
        return;
      }
      if (item.importPrice < 0) {
        alert(`Dòng thứ ${i + 1}: Giá nhập sỉ không được âm!`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch('/api/imports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          note,
          items: importItems
        })
      });

      const data = await res.json();
      if (data.success) {
        alert('Lập phiếu nhập kho và cập nhật tồn kho thành công!');
        
        // Reset form
        setNote('');
        setImportItems([{ productId: '', quantity: 1, importPrice: 0 }]);

        // Tải lại dữ liệu mới nhất
        fetchData();
      } else {
        alert('Nhập hàng thất bại: ' + data.message);
      }
    } catch (err) {
      console.error('Lỗi khi gửi API tạo phiếu nhập:', err);
      alert('Có lỗi xảy ra trong quá trình truyền dữ liệu đến máy chủ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Lọc danh sách phiếu nhập động thời gian thực (receiptCode, creator, creatorName, và tên sản phẩm bên trong)
  const filteredReceipts = receipts.filter((receipt) => {
    const code = receipt.receiptCode ? receipt.receiptCode.toLowerCase() : '';
    const creator = receipt.creator ? receipt.creator.toLowerCase() : '';
    const creatorName = receipt.creatorName ? receipt.creatorName.toLowerCase() : '';
    const query = searchTerm.toLowerCase();

    // Tìm kiếm trong các tên sản phẩm thuộc phiếu nhập
    const hasMatchingProduct = receipt.items && receipt.items.some(item => {
      const prodName = item.productId && item.productId.name ? item.productId.name.toLowerCase() : '';
      return prodName.includes(query);
    });

    return code.includes(query) || 
           creator.includes(query) || 
           creatorName.includes(query) || 
           hasMatchingProduct;
  });

  return (
    <div className="p-4 sm:p-8 bg-gray-50 min-h-screen pb-24">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <ClipboardList className="w-8 h-8 text-blue-600" /> Quản lý Nhập hàng
            </h1>
            <p className="text-gray-500 mt-1">Lập phiếu nhập kho sản phẩm và cập nhật lịch sử nhập hàng sỉ</p>
          </div>
          <button 
            onClick={fetchData}
            className="px-4 py-2 bg-white text-gray-700 hover:bg-gray-100 rounded-xl font-bold border shadow-sm transition text-sm"
          >
            Tải lại trang
          </button>
        </div>

        {loading && receipts.length === 0 ? (
          <div className="p-20 flex flex-col items-center justify-center gap-4 bg-white rounded-3xl border shadow-sm">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
            <p className="text-gray-500 font-bold">Đang tải lịch sử nhập hàng...</p>
          </div>
        ) : error ? (
          <div className="p-20 flex flex-col items-center justify-center gap-4 bg-white rounded-3xl border shadow-sm">
            <AlertCircle className="w-16 h-16 text-red-500" />
            <p className="text-red-600 font-black text-center text-lg">{error}</p>
            <button onClick={fetchData} className="px-6 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-blue-600 transition">Thử lại</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* ================= CỘT 1 & 2: FORM LẬP PHIẾU NHẬP HÀNG ================= */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm">
                <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
                  <PlusCircle className="w-6 h-6 text-blue-600" /> Lập phiếu nhập kho mới
                </h2>

                <form onSubmit={handleSubmitReceipt} className="space-y-6">
                  
                  {/* Mã phiếu & Ghi chú */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Mã phiếu nhập</label>
                      <input 
                        type="text" 
                        disabled
                        className="w-full px-4 py-3 bg-gray-100 border-none rounded-2xl text-sm font-bold text-gray-400 cursor-not-allowed"
                        value="Tự động sinh tại máy chủ"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Người lập phiếu</label>
                      <input 
                        type="text" 
                        disabled
                        className="w-full px-4 py-3 bg-gray-100 border-none rounded-2xl text-sm font-bold text-gray-500 cursor-not-allowed"
                        value={currentUser ? (currentUser.name || currentUser.username || 'Admin') : 'Đang xác thực...'}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Ghi chú nhập hàng</label>
                    <textarea 
                      placeholder="VD: Nhập thêm lô gọng kính chống tia UV sỉ từ nhà phân phối mắt kính Sài Gòn..."
                      rows="2"
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>

                  {/* DANH SÁCH CHI TIẾT SẢN PHẨM NHẬP */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Danh sách sản phẩm nhập sỉ</label>
                      <button
                        type="button"
                        onClick={handleAddItemRow}
                        className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Thêm dòng
                      </button>
                    </div>

                    <div className="space-y-4">
                      {importItems.map((item, index) => (
                        <div key={index} className="flex flex-col sm:flex-row gap-4 p-4 bg-gray-50 rounded-2xl items-end sm:items-center relative border border-transparent hover:border-gray-200 transition">
                          
                          {/* Chọn sản phẩm */}
                          <div className="flex-1 w-full">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Sản phẩm</label>
                            <select
                              required
                              value={item.productId}
                              onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none text-gray-800"
                            >
                              <option value="">-- Chọn sản phẩm trong kho --</option>
                              {products.map(p => (
                                <option key={p._id} value={p._id}>
                                  {p.name} {!p.isActive ? '(Đã ẩn ngoài shop)' : ''} (Hiện có: {p.stock})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Số lượng */}
                          <div className="w-full sm:w-28">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Số lượng nhập</label>
                            <input
                              type="number"
                              required
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none text-gray-800"
                            />
                          </div>

                          {/* Giá nhập sỉ */}
                          <div className="w-full sm:w-36">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Đơn giá sỉ (VNĐ)</label>
                            <input
                              type="number"
                              required
                              min="0"
                              value={item.importPrice}
                              onChange={(e) => handleItemChange(index, 'importPrice', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none text-gray-800 text-right"
                            />
                          </div>

                          {/* Nút xóa hàng */}
                          <button
                            type="button"
                            disabled={importItems.length === 1}
                            onClick={() => handleRemoveItemRow(index)}
                            className="p-2.5 bg-white text-red-500 border border-gray-200 hover:bg-red-50 hover:border-red-200 rounded-xl transition flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ACTION BUTTON */}
                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition shadow-lg shadow-blue-500/20 disabled:opacity-50 text-sm flex items-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Đang cập nhật tồn kho...
                        </>
                      ) : (
                        'Xác nhận nhập kho & cộng tồn kho'
                      )}
                    </button>
                  </div>

                </form>
              </div>
            </div>

            {/* ================= CỘT 3: DANH SÁCH LỊCH SỬ NHẬP KHO ================= */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-fit space-y-6">
              <div>
                <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <ClipboardList className="w-6 h-6 text-blue-600" /> Lịch sử phiếu nhập ({receipts.length})
                </h2>
                {searchTerm && (
                  <p className="text-xs text-gray-400 mt-1">Tìm thấy {filteredReceipts.length} kết quả phù hợp</p>
                )}
              </div>

              {/* Ô TÌM KIẾM NHANH */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Tìm mã phiếu, người lập, sản phẩm..."
                  className="pl-10 pr-8 py-2.5 bg-gray-50 border border-gray-150 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition text-xs w-full font-medium text-gray-700"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 font-bold text-sm"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                {filteredReceipts.length === 0 ? (
                  <div className="text-center py-12">
                    <Search className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="font-bold text-sm text-gray-500">Không tìm thấy kết quả</p>
                    <p className="text-xs text-gray-400">Thử tìm kiếm với từ khóa khác xem sao nhé!</p>
                  </div>
                ) : (
                  filteredReceipts.map(receipt => (
                    <div 
                      key={receipt._id}
                      className="p-4 bg-gray-50 rounded-2xl hover:bg-blue-50/30 border border-transparent hover:border-blue-100 transition cursor-pointer"
                      onClick={() => setSelectedReceipt(receipt)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-black text-blue-600 text-sm">{receipt.receiptCode}</span>
                        <button className="p-1 bg-white text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded border transition flex items-center justify-center">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-bold text-gray-500 mt-2">
                        <div className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(receipt.date).toLocaleDateString('vi-VN')}</div>
                        <div className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {receipt.creatorName || receipt.creator || 'Admin'}</div>
                      </div>

                      <p className="text-xs text-gray-400 mt-2 truncate font-medium">{receipt.note || 'Không có ghi chú'}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ================= HỘP THOẠI XEM CHI TIẾT BIÊN LAI (MODAL) ================= */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Phiếu nhập kho thực tế</span>
                <h2 className="text-xl font-black text-gray-900 mt-0.5">Mã phiếu: <span className="text-blue-600">{selectedReceipt.receiptCode}</span></h2>
              </div>
              <button 
                onClick={() => setSelectedReceipt(null)}
                className="p-2 bg-white text-gray-400 hover:text-gray-900 rounded-full border shadow-sm hover:shadow-md transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border">
                <div>
                  <span className="text-gray-400 text-xs font-bold uppercase block mb-1">Ngày lập phiếu:</span>
                  <p className="font-bold text-gray-800">{new Date(selectedReceipt.date).toLocaleString('vi-VN')}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs font-bold uppercase block mb-1">Nhân viên tạo:</span>
                  <p className="font-bold text-gray-800">{selectedReceipt.creatorName || selectedReceipt.creator || 'Admin'}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-400 text-xs font-bold uppercase block mb-1">Ghi chú phiếu:</span>
                  <p className="font-medium text-gray-700">{selectedReceipt.note || 'Không có ghi chú'}</p>
                </div>
              </div>

              {/* Bảng sản phẩm */}
              <div className="space-y-3">
                <h3 className="font-black text-gray-900 uppercase text-xs tracking-wider text-blue-600">Mặt hàng nhập sỉ và cập nhật stock</h3>
                <div className="space-y-3">
                  {selectedReceipt.items.map((item, index) => {
                    const prod = item.productId || { name: 'Sản phẩm đã bị xóa cứng khỏi MongoDB', images: [] };
                    return (
                      <div key={index} className="flex gap-4 p-4 bg-white border border-gray-100 rounded-2xl hover:border-gray-200 transition items-center">
                        {prod.images && prod.images[0] ? (
                          <img src={prod.images[0]} className="w-14 h-14 object-cover rounded-xl border p-1" alt="" />
                        ) : (
                          <div className="w-14 h-14 bg-gray-50 rounded-xl border flex items-center justify-center text-gray-300"><Package className="w-6 h-6" /></div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 truncate">{prod.name}</p>
                          <p className="text-xs text-gray-400 mt-1 font-bold">Số lượng cộng thêm: +{item.quantity}</p>
                        </div>
                        
                        <div className="text-right">
                          <span className="text-xs text-gray-400 font-bold block uppercase mb-0.5">Giá mua gốc sỉ</span>
                          <span className="font-black text-gray-900">{item.importPrice.toLocaleString('vi-VN')}đ</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <span className="text-xs text-gray-400 font-bold block uppercase">Tổng vốn mua sỉ lô hàng</span>
                <span className="text-2xl font-black text-blue-600">
                  {selectedReceipt.items.reduce((sum, item) => sum + (item.quantity * item.importPrice), 0).toLocaleString('vi-VN')}đ
                </span>
              </div>
              <button 
                onClick={() => setSelectedReceipt(null)}
                className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-2xl transition"
              >
                Đóng
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
