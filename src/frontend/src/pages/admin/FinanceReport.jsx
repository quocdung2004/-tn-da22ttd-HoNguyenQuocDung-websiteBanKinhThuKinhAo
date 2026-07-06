import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Card, Title, Subtitle, Badge, Text } from '@tremor/react';
import { Calendar, Download, Wallet, Package, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

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

  const fetchFinanceReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem('glassesToken');
      const response = await axios.get('/api/reports/finance-details', {
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

  useEffect(() => {
    fetchFinanceReport();
  }, []);

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
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition shadow-sm outline-none">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>Chọn ngày tháng</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition shadow-sm outline-none">
              <Download className="w-4 h-4" />
              <span>Xuất Excel</span>
            </button>
            <button
              onClick={fetchFinanceReport}
              className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shadow-sm outline-none"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className="w-5 h-5" />
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
                <Badge color="emerald">Đối soát dòng tiền tự động</Badge>
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
