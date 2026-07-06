import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Card, Title, Subtitle, Badge, Text } from '@tremor/react';
import { Download, Wallet, Package, Loader2, AlertCircle } from 'lucide-react';

const formatCurrency = (value) => (
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(Number(value || 0))
);

const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));

export default function FinanceReport() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Khởi tạo khoảng ngày mặc định: 30 ngày gần nhất
  const [dateRange, setDateRange] = useState({
    from: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d;
    })(),
    to: new Date()
  });

  const fetchFinanceReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem('glassesToken');

      let url = '/api/reports/finance-details';
      const params = [];
      if (dateRange?.from) {
        params.push(`startDate=${dateRange.from.toISOString()}`);
      }
      if (dateRange?.to) {
        params.push(`endDate=${dateRange.to.toISOString()}`);
      }
      if (params.length > 0) {
        url += `?${params.join('&')}`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data && response.data.success) {
        setData(response.data.data || []);
      } else {
        throw new Error(response.data?.message || 'Không thể tải báo cáo chi tiết tài chính.');
      }
    } catch (err) {
      console.error('Lỗi tải báo cáo chi tiết tài chính:', err);
      setError(err.response?.data?.message || err.message || 'Lỗi kết nối máy chủ khi lấy báo cáo tài chính.');
    } finally {
      setIsLoading(false);
    }
  };

  // Tự động tải lại báo cáo mỗi khi dateRange thay đổi
  useEffect(() => {
    fetchFinanceReport();
  }, [dateRange]);

  const calculatedData = useMemo(() => {
    return data.map(p => {
      const totalImport = Number(p.importPrice || 0) * Number(p.value || 0);
      const totalSale = Number(p.salePrice || 0) * Number(p.value || 0);
      const profit = totalSale - totalImport;
      return {
        ...p,
        totalImport,
        totalSale,
        profit
      };
    });
  }, [data]);

  const totals = useMemo(() => {
    return calculatedData.reduce(
      (acc, item) => {
        acc.qty += Number(item.value || 0);
        acc.importVal += Number(item.totalImport || 0);
        acc.saleVal += Number(item.totalSale || 0);
        acc.profit += Number(item.profit || 0);
        return acc;
      },
      { qty: 0, importVal: 0, saleVal: 0, profit: 0 }
    );
  }, [calculatedData]);

  // Chức năng xuất Excel sử dụng CSV thuần tương thích Unicode
  const handleExportExcel = () => {
    if (calculatedData.length === 0) return;

    // 1. Tiêu đề các cột
    const headers = [
      'Tên Sản Phẩm',
      'Số Lượng Bán',
      'Giá Nhập (Ước tính)',
      'Giá Bán',
      'Doanh Thu',
      'Lợi Nhuận'
    ];

    // 2. Map dữ liệu thành từng dòng của CSV
    const csvRows = calculatedData.map(item => {
      // Bao quanh chuỗi bằng dấu ngoặc kép và chuyển đổi dấu ngoặc kép kép để tránh lỗi vỡ cột
      const nameEscaped = `"${(item.name || '').toString().replace(/"/g, '""')}"`;
      const value = item.value || 0;
      const importPrice = item.importPrice || 0;
      const salePrice = item.salePrice || 0;
      const totalSale = item.totalSale || 0;
      const profit = item.profit || 0;

      return [
        nameEscaped,
        value,
        importPrice,
        salePrice,
        totalSale,
        profit
      ].join(',');
    });

    // 3. Ghép Header và dữ liệu, thêm ký tự BOM (\uFEFF) để Excel hiển thị tiếng Việt UTF-8
    const csvContent = '\uFEFF' + headers.join(',') + '\n' + csvRows.join('\n');

    // 4. Tạo Blob và trigger tải file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().getTime();
    const fileName = `Bao_cao_tai_chinh_${timestamp}.csv`;

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();

    // Giải phóng bộ nhớ
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Hàm helper chuyển Date thành chuỗi YYYY-MM-DD chuẩn múi giờ hiện tại để nạp vào HTML
  const toInputDate = (dateObj) => {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  };

  return (
    <div className="p-4 sm:p-8 bg-slate-50/50 min-h-screen pb-24">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Block */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Wallet className="text-blue-600 w-8 h-8" />
              Báo cáo Tài chính & Đối soát Lợi nhuận
            </h1>
            <p className="text-slate-500 mt-1 text-sm">
              Xem báo cáo doanh thu, giá nhập và biên lợi nhuận ròng chi tiết của cửa hàng Dũng Glasses.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition w-full sm:w-auto">
              <input
                type="date"
                value={toInputDate(dateRange.from)}
                max={toInputDate(dateRange.to)} // Khóa UI: Không cho chọn sau Ngày Kết Thúc
                onChange={(e) => {
                  if (e.target.value) {
                    const newFrom = new Date(e.target.value);
                    setDateRange(prev => ({
                      from: newFrom,
                      // Tự động đẩy Ngày Kết Thúc lên bằng Ngày Bắt Đầu nếu gõ tay vượt quá
                      to: (prev.to && newFrom > prev.to) ? newFrom : prev.to
                    }));
                  }
                }}
                className="outline-none text-sm text-slate-700 bg-transparent cursor-pointer font-medium w-full sm:w-[130px]"
                title="Từ ngày"
              />
              <span className="text-slate-300 font-black">-</span>
              <input
                type="date"
                value={toInputDate(dateRange.to)}
                min={toInputDate(dateRange.from)} // Khóa UI: Không cho chọn trước Ngày Bắt Đầu
                max={toInputDate(new Date())} // Chặn chọn ngày của tương lai
                onChange={(e) => {
                  if (e.target.value) {
                    const newTo = new Date(e.target.value);
                    setDateRange(prev => ({
                      // Tự động lùi Ngày Bắt Đầu về bằng Ngày Kết Thúc nếu gõ tay lùi quá sâu
                      from: (prev.from && newTo < prev.from) ? newTo : prev.from,
                      to: newTo
                    }));
                  }
                }}
                className="outline-none text-sm text-slate-700 bg-transparent cursor-pointer font-medium w-full sm:w-[130px]"
                title="Đến ngày"
              />
            </div>

            <button
              type="button"
              onClick={() => setDateRange({ from: null, to: null })}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition border shadow-sm ${
                !dateRange.from && !dateRange.to
                  ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Tất cả
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isLoading || calculatedData.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-900 text-white text-sm font-semibold transition shadow-sm outline-none"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        {/* LOADING STATE */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
            <p className="text-slate-500 font-bold text-sm">Đang tải dữ liệu báo cáo tài chính...</p>
          </div>
        )}

        {/* ERROR STATE */}
        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <AlertCircle className="w-16 h-16 text-red-500" />
            <p className="text-red-600 font-black text-center text-lg">{error}</p>
            <button
              onClick={fetchFinanceReport}
              className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-blue-600 transition shadow-md"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* MAIN FINANCIAL CONTENT */}
        {!isLoading && !error && (
          <>
            {/* Financial KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-5 border-l-4 border-blue-500 rounded-2xl shadow-sm">
                <Text className="text-xs font-black uppercase text-slate-400">Doanh thu (Ước tính)</Text>
                <p className="mt-2 text-2xl font-black text-slate-900 font-mono">{formatCurrency(totals.saleVal)}</p>
                <p className="mt-1 text-[10px] text-slate-400 font-semibold">Dựa trên {totals.qty} sản phẩm bán ra</p>
              </Card>
              <Card className="p-5 border-l-4 border-slate-500 rounded-2xl shadow-sm">
                <Text className="text-xs font-black uppercase text-slate-400">Tổng chi phí nhập hàng</Text>
                <p className="mt-2 text-2xl font-black text-slate-900 font-mono">{formatCurrency(totals.importVal)}</p>
                <p className="mt-1 text-[10px] text-slate-400 font-semibold">Ước tính giá sỉ nhập kho</p>
              </Card>
              <Card className="p-5 border-l-4 border-emerald-500 rounded-2xl shadow-sm">
                <Text className="text-xs font-black uppercase text-slate-400">Biên lợi nhuận ròng</Text>
                <p className="mt-2 text-2xl font-black text-emerald-600 font-mono">{formatCurrency(totals.profit)}</p>
                <p className="mt-1 text-[10px] text-emerald-500 font-semibold">Tỷ suất lợi nhuận: {((totals.profit / (totals.saleVal || 1)) * 100).toFixed(1)}%</p>
              </Card>
            </div>

            {/* Detailed Table Card */}
            <Card className="rounded-2xl shadow-sm p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <Title className="font-black text-slate-900">Chi tiết lợi nhuận theo từng sản phẩm</Title>
                  <Subtitle className="text-slate-500 text-xs mt-1">
                    Bảng đối soát doanh số bán lẻ kính mát thực tế phục vụ tính toán dòng tiền
                  </Subtitle>
                </div>
                {/* Thay thế thẻ <Badge> mặc định bằng thẻ span tự custom */}
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs rounded-full">
                  Đối soát dòng tiền tự động
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="min-w-full whitespace-nowrap divide-y divide-slate-100">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-black uppercase tracking-wider text-slate-500">
                      <th className="py-4 px-6">Tên Sản Phẩm</th>
                      <th className="py-4 px-6 text-center">Số lượng bán</th>
                      <th className="py-4 px-6 text-right">Giá nhập (Ước tính)</th>
                      <th className="py-4 px-6 text-right">Giá bán</th>
                      <th className="py-4 px-6 text-right">Doanh thu</th>
                      <th className="py-4 px-6 text-right">Lợi nhuận</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-50">
                    {calculatedData.map((product) => (
                      <tr key={product.productId} className="hover:bg-slate-50/50 transition">
                        <td className="py-4 px-6 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                            {product.images?.[0] ? (
                              <img src={product.images[0]} alt="" className="w-full h-full object-contain" />
                            ) : (
                              <Package className="w-5 h-5 text-slate-300" />
                            )}
                          </div>
                          <span className="font-bold text-slate-800 text-sm truncate max-w-sm">{product.name}</span>
                        </td>
                        <td className="py-4 px-6 text-center font-bold text-slate-700 font-mono">
                          {formatNumber(product.value)}
                        </td>
                        <td className="py-4 px-6 text-right font-medium text-slate-500 font-mono">
                          {formatCurrency(product.importPrice)}
                        </td>
                        <td className="py-4 px-6 text-right font-semibold text-slate-700 font-mono">
                          {formatCurrency(product.salePrice)}
                        </td>
                        <td className="py-4 px-6 text-right font-semibold text-slate-900 font-mono">
                          {formatCurrency(product.totalSale)}
                        </td>
                        <td className="py-4 px-6 text-right font-black text-emerald-600 font-mono">
                          {formatCurrency(product.profit)}
                        </td>
                      </tr>
                    ))}
                    {/* Grand Total Row */}
                    <tr className="bg-slate-100/70 border-t-2 border-slate-200 font-black text-slate-900">
                      <td className="py-5 px-6 text-sm font-black">TỔNG CỘNG (GRAND TOTAL)</td>
                      <td className="py-5 px-6 text-center font-mono text-base">{formatNumber(totals.qty)}</td>
                      <td className="py-5 px-6 text-right font-mono text-base text-slate-500">{formatCurrency(totals.importVal)}</td>
                      <td className="py-5 px-6 text-right font-mono text-base text-slate-700">—</td>
                      <td className="py-5 px-6 text-right font-mono text-base text-slate-900">{formatCurrency(totals.saleVal)}</td>
                      <td className="py-5 px-6 text-right font-mono text-lg text-emerald-700">{formatCurrency(totals.profit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
