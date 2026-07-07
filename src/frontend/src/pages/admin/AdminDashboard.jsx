import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  AlertCircle,
  Award,
  BarChart3,
  Clock,
  DollarSign,
  Loader2,
  Package,
  ShoppingBag,
  TrendingUp,
  ShieldAlert,
  Archive,
  RefreshCw,
  Info,
  Download
} from 'lucide-react';
import {
  Card,
  Text,
  Title,
  Subtitle,
  AreaChart,
  BarChart as TremorBarChart,
  DonutChart,
  BarList,
  Flex,
  Badge,
  Tracker
} from '@tremor/react';
import { useSocket } from '../../context/SocketContext';

// --- ĐỊNH DẠNG TIỀN TỆ & CON SỐ ---
const formatCurrency = (value) => (
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(Number(value || 0))
);

const formatShortCurrency = (value) => {
  const num = Number(value || 0);
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  let formatted = '';
  if (absNum >= 1.0e6) {
    formatted = `${(absNum / 1.0e6).toFixed(1).replace(/\.0$/, '')} Tr`;
  } else if (absNum >= 1.0e3) {
    formatted = `${(absNum / 1.0e3).toFixed(1).replace(/\.0$/, '')} K`;
  } else {
    formatted = `${absNum} đ`;
  }
  return isNegative ? `-${formatted}` : formatted;
};

const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));

const formatDateToDayMonth = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
};

export default function AdminDashboard() {
  const { socket } = useSocket();
  const debounceTimeoutRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- STATE CHO BÁO CÁO CHIẾN LƯỢC ---
  const [financeData, setFinanceData] = useState({ dailyFinance: [], codCongestion: [] });
  const [financeComparison, setFinanceComparison] = useState({
    expectedRevenue: 0,
    expectedCost: 0,
    expectedProfit: 0,
    actualRevenue: 0,
    actualCost: 0,
    actualProfit: 0,
    revenueShortfall: 0,
    revenueShortfallPercent: 0,
    profitShortfall: 0,
    profitShortfallPercent: 0
  });
  const [logisticsData, setLogisticsData] = useState({ shipperKPIs: [], pendingPhysicalReturns: 0 });
  const [productsPerformance, setProductsPerformance] = useState({ topSelling: [], topSlowest: [] });
  const [brandPerformance, setBrandPerformance] = useState([]);
  const [orderRatio, setOrderRatio] = useState([]);
  const [customerData, setCustomerData] = useState([]);

  // --- STATE CHO THỐNG KÊ VẬN HÀNH (CŨ) ---
  const [operationalData, setOperationalData] = useState(null);

  // --- FETCH BÁO CÁO CHIẾN LƯỢC ---
  const fetchStrategicData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const token = localStorage.getItem('glassesToken');
      const headers = { Authorization: `Bearer ${token}` };

      const [finRes, compRes, logRes, prodPerfRes, brandRes, ratioRes, custRes] = await Promise.all([
        fetch('/api/dashboard/finance', { headers }),
        fetch('/api/dashboard/finance/comparison', { headers }),
        fetch('/api/dashboard/logistics', { headers }),
        fetch('/api/dashboard/products/performance', { headers }),
        fetch('/api/dashboard/brands/top', { headers }),
        fetch('/api/dashboard/orders/ratio', { headers }),
        fetch('/api/dashboard/customers', { headers })
      ]);

      const [fin, comp, log, prodPerf, brand, ratio, cust] = await Promise.all([
        finRes.json(), compRes.json(), logRes.json(), prodPerfRes.json(), brandRes.json(), ratioRes.json(), custRes.json()
      ]);

      if (!fin.success || !comp.success || !log.success || !prodPerf.success || !brand.success || !ratio.success || !cust.success) {
        throw new Error('Không thể tải một hoặc nhiều nhóm báo cáo chiến lược.');
      }

      setFinanceData(fin.data);
      setFinanceComparison(comp.data);
      setLogisticsData(log.data);
      setProductsPerformance(prodPerf.data);
      setBrandPerformance(brand.data);
      setOrderRatio(ratio.data);
      setCustomerData(cust.data.cancelReasons || []);
    } catch (err) {
      console.error('Lỗi tải dữ liệu báo cáo chiến lược:', err);
      if (!silent) setError(err.message || 'Lỗi kết nối máy chủ khi lấy báo cáo chiến lược.');
      throw err;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // --- FETCH THỐNG KÊ VẬN HÀNH (CŨ) ---
  const fetchOperationalData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch('/api/admin/dashboard-v2', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể tải dữ liệu thống kê vận hành.');
      }
      setOperationalData(data);
    } catch (err) {
      console.error('Lỗi tải dữ liệu vận hành:', err);
      if (!silent) setError(err.message || 'Không thể kết nối đến máy chủ.');
      throw err;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // --- ĐIỀU PHỐI FETCH DỮ LIỆU ---
  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchStrategicData({ silent: true }),
        fetchOperationalData({ silent: true })
      ]);
    } catch (err) {
      setError(err.message || 'Không thể kết nối đến máy chủ.');
    } finally {
      setLoading(false);
    }
  }, [fetchStrategicData, fetchOperationalData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- ĐỒNG BỘ REALTIME QUA SOCKET ---
  useEffect(() => {
    if (!socket) return undefined;

    const handleDashboardUpdate = () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        loadData({ silent: true });
      }, 2000);
    };

    socket.on('order:new', handleDashboardUpdate);
    socket.on('order:statusChanged', handleDashboardUpdate);
    socket.on('product:stockUpdated', handleDashboardUpdate);

    return () => {
      socket.off('order:new', handleDashboardUpdate);
      socket.off('order:statusChanged', handleDashboardUpdate);
      socket.off('product:stockUpdated', handleDashboardUpdate);
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [socket, loadData]);

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-8 pb-24">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* --- TIÊU ĐỀ DASHBOARD --- */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="text-blue-600 w-8 h-8" />
              Bảng Điều Khiển Quản Trị
            </h1>
            <p className="text-slate-500 mt-1 text-sm">
              Hệ thống E-commerce Dũng Glasses · Dữ liệu thời gian thực
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData()}
              className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shadow-sm outline-none"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* --- HIỂN THỊ LOADING --- */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
            <p className="text-slate-500 font-bold text-sm">Đang tải và tính toán dữ liệu báo cáo...</p>
          </div>
        )}

        {/* --- HIỂN THỊ ERROR --- */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <AlertCircle className="w-16 h-16 text-red-500" />
            <p className="text-red-600 font-black text-center text-lg">{error}</p>
            <button
              onClick={() => loadData()}
              className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-blue-600 transition shadow-md"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* --- NỘI DUNG CHÍNH --- */}
        {!loading && !error && (
          <UnifiedDashboardView
            financeData={financeData}
            financeComparison={financeComparison}
            logisticsData={logisticsData}
            productsPerformance={productsPerformance}
            brandPerformance={brandPerformance}
            orderRatio={orderRatio}
            customerData={customerData}
            operationalData={operationalData}
          />
        )}
      </div>
    </div>
  );
}

// ==========================================
// 1. COMPONENT DASHBOARD HỢP NHẤT (UNIFIED SAAS DASHBOARD)
// ==========================================
function UnifiedDashboardView({
  financeData,
  financeComparison,
  logisticsData,
  productsPerformance,
  brandPerformance,
  orderRatio,
  customerData,
  operationalData
}) {
  const pendingReturns = logisticsData.pendingPhysicalReturns || 0;

  // --- STATE CHO DRILL-DOWN MODAL ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalType, setModalType] = useState('orders'); // 'orders' | 'inventory'

  const handleOpenModal = (title, type) => {
    setModalTitle(title);
    setModalType(type);
    setIsModalOpen(true);
  };

  // Xây dựng dữ liệu cho Tracker cảnh báo hàng hoàn (màu đỏ / màu xanh)
  const trackerCells = Array.from({ length: 20 }, (_, i) => {
    if (i < pendingReturns) {
      return { color: 'rose', tooltip: `Đơn hàng hoàn vật lý chưa về kho: Đơn thứ ${i + 1}` };
    }
    return { color: 'emerald', tooltip: 'Vị trí trống / Kho nhận hàng ổn định' };
  });

  // Xác định màu cảnh báo 3 cấp độ cho tỷ lệ hao hụt (Shortfall Percent)
  const getShortfallBadgeColor = (percent) => {
    if (percent < 10) return 'emerald';
    if (percent <= 20) return 'amber';
    return 'rose';
  };

  const getShortfallBgColor = (percent) => {
    if (percent < 10) return 'bg-emerald-50 border-emerald-100';
    if (percent <= 20) return 'bg-amber-50 border-amber-100';
    return 'bg-red-50 border-red-100';
  };

  const revenue = operationalData?.revenue || {};
  const profit = operationalData?.profit || {};
  const orders = operationalData?.orders || {};
  const inventory = operationalData?.inventory || {};
  const campaigns = operationalData?.saleCampaignAnalytics || [];

  return (
    <div className="space-y-6">

      {/* --- PHẦN 1: THẺ THỐNG KÊ DOANH THU & LỢI NHUẬN (VẬN HÀNH) - LƯỚI 3x2 --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Hàng 1 */}
        <LegacyMetricCard
          title="Doanh thu hôm nay"
          value={formatCurrency(revenue.today)}
          description="Doanh thu trong ngày"
          icon={DollarSign}
          tone="blue"
          onClick={() => handleOpenModal('Chi tiết Doanh thu hôm nay', 'orders')}
          className="cursor-pointer hover:shadow-md hover:border-blue-400 transition-all"
        />
        <LegacyMetricCard
          title="Doanh thu tháng"
          value={formatCurrency(revenue.thisMonth)}
          description="Doanh thu tháng này"
          icon={BarChart3}
          tone="blue"
          onClick={() => handleOpenModal('Chi tiết Doanh thu tháng', 'orders')}
          className="cursor-pointer hover:shadow-md hover:border-blue-400 transition-all"
        />
        <LegacyMetricCard
          title="Doanh thu năm"
          value={formatCurrency(revenue.thisYear)}
          description="Doanh thu năm nay"
          icon={TrendingUp}
          tone="emerald"
          onClick={() => handleOpenModal('Chi tiết Doanh thu năm', 'orders')}
          className="cursor-pointer hover:shadow-md hover:border-blue-400 transition-all"
        />
        {/* Hàng 2 */}
        <LegacyMetricCard
          title="Lợi nhuận tháng"
          value={formatCurrency(profit.thisMonth)}
          description="Lợi nhuận tháng này"
          icon={TrendingUp}
          tone="emerald"
          onClick={() => handleOpenModal('Chi tiết Lợi nhuận tháng', 'orders')}
          className="cursor-pointer hover:shadow-md hover:border-blue-400 transition-all"
        />
        <LegacyMetricCard
          title="Lợi nhuận năm"
          value={formatCurrency(profit.thisYear)}
          description="Lợi nhuận năm nay"
          icon={Award}
          tone="violet"
          onClick={() => handleOpenModal('Chi tiết Lợi nhuận năm', 'orders')}
          className="cursor-pointer hover:shadow-md hover:border-blue-400 transition-all"
        />
        <LegacyMetricCard
          title="Giá trị tồn kho"
          value={formatCurrency(inventory.inventoryValue)}
          description="Giá trị tồn * Giá nhập"
          icon={DollarSign}
          tone="violet"
          onClick={() => handleOpenModal('Chi tiết Giá trị tồn kho', 'inventory')}
          className="cursor-pointer hover:shadow-md hover:border-blue-400 transition-all"
        />
      </div>

      {/* --- PHẦN 2: QUY TRÌNH XỬ LÝ ĐƠN HÀNG (VẬN HÀNH) --- */}
      <LegacyOrderStatusGrid orders={orders} />

      {/* --- PHẦN 3: ĐỐI SOÁT TÀI CHÍNH VÀ CẢNH BÁO TỒN KHO --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Đối soát Doanh thu */}
        <Card className={`border-t-4 rounded-2xl shadow-sm p-6 ${getShortfallBgColor(financeComparison.revenueShortfallPercent)}`}>
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-slate-400 font-bold uppercase tracking-wider text-xs">Đối soát Doanh thu</Text>
              <p className="text-xs text-gray-500 mt-1">(Toàn thời gian)</p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <Text className="text-slate-400 text-xs font-semibold">Dự kiến (Chưa hủy)</Text>
                  <p className="text-xl font-extrabold text-slate-800 mt-1">
                    {formatCurrency(financeComparison.expectedRevenue)}
                  </p>
                </div>
                <div>
                  <Text className="text-slate-500 text-xs font-semibold">Thực tế (Thành công)</Text>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {formatCurrency(financeComparison.actualRevenue)}
                  </p>
                </div>
              </div>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="text-sm font-bold text-slate-800">
                Hao hụt: {(financeComparison.revenueShortfallPercent || 0).toFixed(1)}%
              </span>
              <Text className="text-[10px] text-slate-400 font-semibold mt-2">
                Thất thu: {formatCurrency(financeComparison.revenueShortfall)}
              </Text>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <Text className="text-slate-500 text-xs font-medium">
              {financeComparison.revenueShortfallPercent > 20
                ? 'CẢNH BÁO: Tỷ lệ thất thu doanh thu vượt quá 20%. Hãy kiểm tra các đơn hàng giao thất bại!'
                : 'Mức chênh lệch doanh thu dự kiến và thực tế nằm trong tầm kiểm soát.'}
            </Text>
          </div>
        </Card>

        {/* Đối soát Lợi nhuận gộp */}
        <Card className={`border-t-4 rounded-2xl shadow-sm p-6 ${getShortfallBgColor(financeComparison.profitShortfallPercent)}`}>
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-slate-400 font-bold uppercase tracking-wider text-xs">Đối soát Lợi nhuận gộp</Text>
              <p className="text-xs text-gray-500 mt-1">(Toàn thời gian)</p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <Text className="text-slate-400 text-xs font-semibold">Lợi nhuận Dự kiến</Text>
                  <p className="text-xl font-extrabold text-slate-800 mt-1">
                    {formatCurrency(financeComparison.expectedProfit)}
                  </p>
                </div>
                <div>
                  <Text className="text-slate-500 text-xs font-semibold">Lợi nhuận Thực tế</Text>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {formatCurrency(financeComparison.actualProfit)}
                  </p>
                </div>
              </div>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="text-sm font-bold text-slate-800">
                Hao hụt: {(financeComparison.profitShortfallPercent || 0).toFixed(1)}%
              </span>
              <Text className="text-[10px] text-slate-400 font-semibold mt-2">
                Hao hụt lợi nhuận: {formatCurrency(financeComparison.profitShortfall)}
              </Text>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <Text className="text-slate-500 text-xs font-medium">
              {financeComparison.profitShortfallPercent > 20
                ? 'BÁO ĐỘNG ĐỎ: Tỷ lệ hao hụt lợi nhuận thực tế ở mức cực kỳ nghiêm trọng (> 20%).'
                : 'Mức chênh lệch lợi nhuận thực tế đạt mức an toàn.'}
            </Text>
          </div>
        </Card>
      </div>

      {/* --- CẢNH BÁO HÀNG HOÀN VẬT LÝ --- */}
      <Card className={`border-l-4 ${pendingReturns > 0 ? 'border-rose-500 bg-rose-50/20' : 'border-emerald-500 bg-emerald-50/10'} rounded-2xl shadow-sm`}>
        <Flex className="flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs uppercase font-black tracking-wider text-slate-500 flex items-center gap-1.5">
              <Archive className={`w-4 h-4 ${pendingReturns > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
              Cảnh báo Vận hành & Hàng hoàn Vật lý
            </span>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-black ${pendingReturns > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {pendingReturns} Đơn
              </span>
              <span className="text-slate-500 text-sm font-semibold">đang chờ hoàn trả vật lý</span>
            </div>
            <Text className="text-slate-500 text-xs">
              {pendingReturns > 0
                ? 'Cần đốc thúc shipper nộp lại hàng hoàn về kho để cập nhật tồn kho chính xác.'
                : 'Tuyệt vời! Hiện tại không có đơn hàng hoàn nào bị đọng bên ngoài kho.'}
            </Text>
          </div>
          <div className="w-full md:w-80 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>Biểu đồ trạng thái hoàn hàng (20 đơn gần nhất)</span>
              <Badge color={pendingReturns > 0 ? 'red' : 'emerald'} size="xs">
                {pendingReturns > 0 ? 'Cảnh báo' : 'An toàn'}
              </Badge>
            </div>
            <Tracker data={trackerCells} className="mt-2" />
          </div>
        </Flex>
      </Card>

      {/* --- BIỂU ĐỒ LỢI NHUẬN GỐP & TỶ LỆ TRẠNG THÁI ĐƠN HÀNG --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doanh thu & Lợi nhuận gộp (7 ngày) */}
        <Card className="lg:col-span-2 rounded-2xl shadow-sm">
          <Title className="font-black text-slate-900">Biểu đồ Lợi nhuận gộp (7 ngày gần nhất)</Title>
          <Subtitle className="text-slate-500 text-xs mt-1">
            Thống kê doanh thu, chi phí nhập sỉ và lợi nhuận gộp từ các đơn hàng shipped hoặc completed
          </Subtitle>
          <AreaChart
            className="h-80 mt-6"
            data={(financeData.dailyFinance || []).map(item => ({
              ...item,
              date: formatDateToDayMonth(item.date)
            }))}
            index="date"
            categories={['Doanh thu', 'Chi phí', 'Lợi nhuận']}
            colors={['blue', 'slate', 'emerald']}
            valueFormatter={formatShortCurrency}
            yAxisWidth={90}
          />
        </Card>

        {/* Tỷ lệ trạng thái đơn hàng */}
        <Card className="rounded-2xl shadow-sm">
          <Title className="font-black text-slate-900">Tỷ lệ Trạng thái Đơn hàng</Title>
          <Subtitle className="text-slate-500 text-xs mt-1">
            Tỷ lệ đơn hàng thành công (completed + shipped) vs. đơn hàng đã hủy (cancelled)
          </Subtitle>
          <div className="flex flex-col items-center justify-center h-80 mt-2">
            {orderRatio.length === 0 ? (
              <Text className="text-slate-400 font-bold">Chưa có dữ liệu tỷ lệ</Text>
            ) : (
              <>
                <DonutChart
                  className="h-44"
                  data={orderRatio}
                  category="value"
                  index="name"
                  colors={['emerald', 'rose', 'slate']}
                  valueFormatter={(val) => `${formatNumber(val)} đơn`}
                />
                <div className="w-full mt-6 space-y-2">
                  {orderRatio.map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-emerald-500' : idx === 1 ? 'bg-rose-500' : 'bg-slate-400'}`} />
                        <span className="font-bold text-slate-700">{item.name}</span>
                      </div>
                      <span className="font-black text-slate-900">{item.percentage}% ({item.value} đơn)</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>



      {/* --- HIỆU SUẤT SẢN PHẨM: TOP 10 BÁN CHẠY & TOP 10 BÁN CHẬM (UI THUMBNAIL) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 Bán chạy nhất */}
        <Card className="rounded-2xl shadow-sm min-h-[400px] flex flex-col justify-between p-6">
          <div className="flex-1 flex flex-col">
            <Title className="font-black text-slate-900">Top 10 Sản phẩm bán chạy nhất</Title>
            <Subtitle className="text-slate-500 text-xs mt-1 mb-6">
              Xếp hạng theo số lượng bán ra (chỉ tính các đơn hàng hợp lệ)
            </Subtitle>
            {productsPerformance.topSelling.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <Award className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm font-bold text-slate-400">Chưa có sản phẩm bán chạy</p>
              </div>
            ) : (
              <div className="space-y-3">
                {productsPerformance.topSelling.map((product, index) => (
                  <div key={product.productId || index} className="flex items-center gap-4 p-3 border-b border-dashed border-slate-200 last:border-0 hover:bg-slate-50 transition">
                    <div className="w-7 h-7 rounded-full bg-slate-950 text-white flex items-center justify-center text-xs font-black shrink-0">
                      {index + 1}
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {product.images?.[0] ? (
                        <img src={product.images[0]} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <Package className="w-5 h-5 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-900 text-sm truncate">{product.name}</h3>
                      <p className="text-xs font-semibold text-slate-400 font-mono">Tồn: {formatNumber(product.stock)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-black text-blue-600">{formatNumber(product.value)}</p>
                      <p className="text-[9px] uppercase font-black text-slate-400">đã bán</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Top 10 Bán chậm nhất */}
        <Card className="rounded-2xl shadow-sm min-h-[400px] flex flex-col justify-between p-6">
          <div className="flex-1 flex flex-col">
            <Title className="font-black text-slate-900">Top 10 Sản phẩm bán chậm nhất</Title>
            <Subtitle className="text-slate-500 text-xs mt-1 mb-6">
              Chỉ xét sản phẩm nhập kho quá 30 ngày (bao gồm cả sản phẩm chưa bán được cái nào)
            </Subtitle>
            {productsPerformance.topSlowest.length < 3 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <Archive className="w-20 h-20 text-slate-300 mb-3" />
                <p className="text-base font-bold text-slate-400 max-w-xs leading-relaxed">
                  Tuyệt vời! Hiện tại kho không có sản phẩm nào tồn đọng quá lâu.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {productsPerformance.topSlowest.map((product, index) => (
                  <div key={product.productId || index} className="flex items-center gap-4 p-3 border-b border-dashed border-slate-200 last:border-0 hover:bg-slate-50 transition">
                    <div className="w-7 h-7 rounded-full bg-slate-950 text-white flex items-center justify-center text-xs font-black shrink-0">
                      {index + 1}
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {product.images?.[0] ? (
                        <img src={product.images[0]} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <Package className="w-5 h-5 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-900 text-sm truncate">{product.name}</h3>
                      <p className="text-xs font-semibold text-slate-400 font-mono">Tồn: {formatNumber(product.stock)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-black text-amber-600">{formatNumber(product.value)}</p>
                      <p className="text-[9px] uppercase font-black text-slate-400">đã bán</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* --- DOANH THU THEO THƯƠNG HIỆU & ĐIỂM NGHẼN DÒNG TIỀN COD --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doanh thu theo Nhãn hàng */}
        <Card className="lg:col-span-2 rounded-2xl shadow-sm">
          <Title className="font-black text-slate-900">Doanh thu theo Nhãn hàng (Brand)</Title>
          <Subtitle className="text-slate-500 text-xs mt-1">
            Tính tổng doanh thu lũy kế thực tế mang lại từ từng nhãn hàng (đơn hàng hợp lệ)
          </Subtitle>
          <TremorBarChart
            className="h-80 mt-6"
            data={brandPerformance}
            index="name"
            categories={['Doanh thu']}
            colors={['indigo']}
            valueFormatter={formatShortCurrency}
            yAxisWidth={90}
          />
        </Card>

        {/* Điểm nghẽn dòng tiền COD */}
        <Card className="rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <Title className="font-black text-slate-900">Điểm nghẽn dòng tiền COD</Title>
            <Subtitle className="text-slate-500 text-xs mt-1">
              Dòng tiền mặt đang kẹt ở các giai đoạn vận chuyển, nộp tiền hoặc đối soát
            </Subtitle>
            <div className="mt-6 space-y-4">
              {financeData.codCongestion.length === 0 ? (
                <Text className="text-slate-400 font-bold text-center py-8">Không có dòng tiền COD kẹt</Text>
              ) : (
                <BarList
                  data={financeData.codCongestion}
                  valueFormatter={formatCurrency}
                  colors={['amber']}
                />
              )}
            </div>
          </div>
          {financeData.codCongestion.length > 0 && (
            <div className="border-t border-slate-100 pt-4 mt-6 flex justify-between text-xs font-bold text-slate-500">
              <span>Tổng đơn kẹt COD:</span>
              <span className="text-slate-900">
                {formatNumber(financeData.codCongestion.reduce((sum, item) => sum + item.count, 0))} đơn
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* --- HIỆU SUẤT SHIPPER & LÝ DO HỦY ĐƠN --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hiệu suất giao hàng Shipper */}
        <Card className="lg:col-span-2 rounded-2xl shadow-sm">
          <Title className="font-black text-slate-900">Hiệu suất Shipper (KPI)</Title>
          <Subtitle className="text-slate-500 text-xs mt-1">
            Đếm số lượng đơn hàng giao thành công vs. giao thất bại của từng shipper
          </Subtitle>
          <TremorBarChart
            className="h-80 mt-6"
            data={logisticsData.shipperKPIs}
            index="name"
            categories={['Thành công', 'Thất bại']}
            colors={['emerald', 'rose']}
            valueFormatter={(val) => `${formatNumber(val)} đơn`}
            yAxisWidth={48}
            type="stacked"
          />
        </Card>

        {/* Lý do hủy đơn */}
        <Card className="rounded-2xl shadow-sm">
          <Title className="font-black text-slate-900">Lý do hủy đơn</Title>
          <Subtitle className="text-slate-500 text-xs mt-1">
            Các nguyên nhân chính dẫn đến đơn hàng bị hủy từ phía khách hàng
          </Subtitle>
          <div className="mt-6">
            {customerData.length === 0 ? (
              <Text className="text-slate-400 font-bold text-center py-8">Chưa ghi nhận lý do hủy đơn nào</Text>
            ) : (
              <BarList
                data={customerData}
                valueFormatter={(val) => `${formatNumber(val)} đơn`}
                color="rose"
              />
            )}
          </div>
        </Card>
      </div>

      {/* --- CHIẾN DỊCH KHUYẾN MÃI & CẢNH BÁO TỒN KHO --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Phân tích chiến dịch */}
        <div className="lg:col-span-2">
          <LegacyCampaignAnalytics campaigns={campaigns} />
        </div>

        {/* Cảnh báo danh sách hàng tồn kho */}
        <div className="lg:col-span-1 space-y-6">
          <LegacyStockList title="Sản phẩm hết hàng" products={inventory.outOfStockProducts || []} emptyText="Không có sản phẩm hết hàng." tone="red" />
          <LegacyStockList title="Sản phẩm sắp hết hàng" products={inventory.lowStockProducts || []} emptyText="Không có sản phẩm sắp hết hàng." tone="amber" />
        </div>
      </div>

      {/* --- PHÂN TÍCH TỒN KHO Ở ĐÁY TRANG - LƯỚI 4 CỘT DÀN NGANG --- */}
      <div className="space-y-6">
        {Number(inventory.negativeStockCount || 0) > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-700 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 animate-bounce" />
            Có dữ liệu tồn kho âm cần kiểm tra gấp!
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <LegacyMetricCard title="Tổng sản phẩm" value={formatNumber(inventory.totalProducts)} description="Sản phẩm trong hệ thống" icon={Package} tone="slate" />
          <LegacyMetricCard title="Số lượng tồn kho" value={formatNumber(inventory.totalStockQuantity)} description="Tổng số lượng tồn" icon={ShoppingBag} tone="emerald" />
          <LegacyMetricCard title="Hết hàng" value={formatNumber(inventory.outOfStockCount)} description="Sản phẩm hết hàng" icon={AlertCircle} tone="red" />
          <LegacyMetricCard title="Sắp hết hàng" value={formatNumber(inventory.lowStockCount)} description="Tồn kho từ 1 đến 5" icon={Clock} tone="amber" />
        </div>
      </div>

      {/* Drill-down Detail Modal */}
      <DetailModal
        isOpen={isModalOpen}
        title={modalTitle}
        type={modalType}
        onClose={() => setIsModalOpen(false)}
      />

    </div>
  );
}



// ==========================================
// 3. LEGACY COMPONENTS (TRÁNH LÀM HỎNG GIAO DIỆN CŨ)
// ==========================================
const toneClasses = {
  blue: { border: 'border-blue-100', background: 'bg-blue-50', text: 'text-blue-600' },
  emerald: { border: 'border-emerald-100', background: 'bg-emerald-50', text: 'text-emerald-600' },
  amber: { border: 'border-amber-100', background: 'bg-amber-50', text: 'text-amber-600' },
  red: { border: 'border-red-100', background: 'bg-red-50', text: 'text-red-600' },
  slate: { border: 'border-slate-200', background: 'bg-slate-50', text: 'text-slate-700' },
  violet: { border: 'border-violet-100', background: 'bg-violet-50', text: 'text-violet-600' }
};

const progressClasses = {
  blue: 'bg-blue-600',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-500'
};

function LegacyMetricCard({ title, value, description, icon: Icon, tone = 'blue', onClick, className = '' }) {
  const toneClass = toneClasses[tone] || toneClasses.blue;
  return (
    <div
      onClick={onClick}
      className={`bg-white border ${toneClass.border} rounded-2xl p-5 shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</p>
          <p className="mt-2 text-xl font-black text-slate-900 break-words">{value}</p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">{description}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneClass.background} ${toneClass.text} flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function LegacyOrderStatusGrid({ orders }) {
  const statuses = [
    { label: 'Chờ xử lý', value: orders.pending, icon: Clock, tone: 'amber' },
    { label: 'Đang xử lý', value: orders.processing, icon: ShoppingBag, tone: 'blue' },
    { label: 'Đang giao', value: orders.shipping, icon: Package, tone: 'violet' },
    { label: 'Đã hoàn thành', value: orders.completed, icon: Award, tone: 'emerald' },
    { label: 'Đã hủy', value: orders.cancelled, icon: AlertCircle, tone: 'red' }
  ];
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-base font-black text-slate-950">Quy trình xử lý đơn hàng</h2>
        <span className="text-xs font-bold text-slate-500">Tổng cộng: {formatNumber(orders.total)} đơn</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {statuses.map((status) => (
          <LegacyMetricCard key={status.label} title={status.label} value={formatNumber(status.value)} description="Số đơn hàng" icon={status.icon} tone={status.tone} />
        ))}
      </div>
    </div>
  );
}

function LegacyTopProductsPanel({ products }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
      <h2 className="text-base font-black text-slate-950 mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-amber-500" />
        Sản phẩm bán chạy nhất
      </h2>
      {products.length === 0 ? (
        <LegacyEmptyState text="Chưa có dữ liệu sản phẩm bán chạy." />
      ) : (
        <div className="space-y-3">
          {products.slice(0, 5).map((product, index) => (
            <div key={product._id || index} className="flex items-center gap-4 rounded-xl border border-slate-100 p-3">
              <div className="w-7 h-7 rounded-full bg-slate-950 text-white flex items-center justify-center text-xs font-black flex-shrink-0">
                {index + 1}
              </div>
              <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {product.images?.[0] ? <img src={product.images[0]} alt="" className="w-full h-full object-contain" /> : <Package className="w-5 h-5 text-slate-300" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 text-sm truncate">{product.name}</h3>
                <p className="text-xs font-semibold text-slate-400">{formatCurrency(product.revenue)} doanh thu</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-base font-black text-blue-600">{formatNumber(product.sold)}</p>
                <p className="text-[9px] uppercase font-black text-slate-400">đã bán</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyProgressList({ title, icon: Icon, items, valueKey, valueFormatter, accent = 'blue' }) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 0);
  const progressClass = progressClasses[accent] || progressClasses.blue;
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
      <h2 className="text-base font-black text-slate-950 mb-4 flex items-center gap-2">
        <Icon className="w-5 h-5 text-slate-600" />
        {title}
      </h2>
      {items.length === 0 ? (
        <LegacyEmptyState text="Chưa có dữ liệu." />
      ) : (
        <div className="space-y-4">
          {items.slice(0, 5).map((item, index) => {
            const value = Number(item[valueKey] || 0);
            const percent = maxValue > 0 ? (value / maxValue) * 100 : 0;
            return (
              <div key={item._id || item.name || index}>
                <div className="flex items-end justify-between gap-3 mb-1.5">
                  <span className="font-bold text-sm text-slate-800 truncate">{item.name}</span>
                  <span className="text-xs font-black text-slate-600 flex-shrink-0">{valueFormatter(value)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${progressClass}`} style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LegacyCampaignAnalytics({ campaigns }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm overflow-hidden h-full flex flex-col">
      <h2 className="text-base font-black text-slate-950 mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-blue-600" />
        Phân tích chiến dịch khuyến mãi
      </h2>
      {campaigns.length === 0 ? (
        <LegacyEmptyState text="Chưa có chiến dịch khuyến mãi để thống kê." />
      ) : (
        <div className="overflow-x-auto flex-1">
          <table className="min-w-full whitespace-nowrap">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-100 text-left uppercase tracking-wide text-slate-400 text-xs">
                <th className="py-3 px-4 font-black">Chiến dịch</th>
                <th className="py-3 px-4 font-black">Đã dùng</th>
                <th className="py-3 px-4 font-black">Còn lại</th>
                <th className="py-3 px-4 font-black">Đơn hàng</th>
                <th className="py-3 px-4 font-black text-right">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 5).map((campaign) => (
                <tr key={campaign._id} className="border-b border-slate-50 last:border-0">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{campaign.name}</div>
                    <div className="text-[10px] font-semibold text-slate-400">{campaign.discountType === 'percent' ? `${campaign.discountValue}%` : formatCurrency(campaign.discountValue)}</div>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-700">{formatNumber(campaign.usedCount)}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{campaign.usageLimitType === 'limited' ? formatNumber(campaign.remainingCount) : 'Không giới hạn'}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{formatNumber(campaign.ordersGenerated)}</td>
                  <td className={`py-3 px-4 text-right ${(campaign.revenueGenerated || 0) > 0
                    ? 'text-blue-600 font-black'
                    : 'text-slate-400 font-medium'
                    }`}>
                    {formatCurrency(campaign.revenueGenerated)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LegacyStockList({ title, products, emptyText, tone = 'amber' }) {
  const toneClass = toneClasses[tone] || toneClasses.amber;
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
      <h2 className="text-base font-black text-slate-950 mb-4 flex items-center gap-2">
        <Package className={`w-5 h-5 ${toneClass.text}`} />
        {title}
      </h2>
      {products.length === 0 ? (
        <LegacyEmptyState text={emptyText} />
      ) : (
        <div className="space-y-3">
          {products.slice(0, 5).map((product, index) => (
            <div key={product._id || index} className="flex items-center gap-4 rounded-xl border border-slate-100 p-3">
              <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {product.images?.[0] ? <img src={product.images[0]} alt="" className="w-full h-full object-contain" /> : <Package className="w-5 h-5 text-slate-300" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 text-sm truncate">{product.name}</h3>
                <p className="text-[10px] font-semibold text-slate-400">Giá vốn: {formatCurrency(product.importPrice)} · Giá trị: {formatCurrency(product.inventoryValue)}</p>
              </div>
              <div className={`${toneClass.background} ${toneClass.text} px-2.5 py-0.5 rounded-full text-[10px] font-black flex-shrink-0`}>
                Tồn: {formatNumber(product.stock)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyEmptyState({ text }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 px-4 text-center text-xs font-bold text-slate-400">
      <Package className="w-10 h-10 mx-auto text-slate-300 mb-3" />
      {text}
    </div>
  );
}

// ==========================================
// 4. DETAIL MODAL COMPONENT (DRILL-DOWN)
// ==========================================
function DetailModal({ isOpen, title, type, onClose }) {
  if (!isOpen) return null;

  // Step 1: Local state inside modal
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 2: Lazy Fetching logic
  useEffect(() => {
    if (!isOpen) {
      setData([]);
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const token = localStorage.getItem('glassesToken');

        let url = '';
        if (type === 'orders') {
          // Map title to correct filter parameter
          let filter = 'today';
          if (title.includes('tháng')) {
            filter = title.includes('Doanh thu') ? 'thisMonth' : 'profitMonth';
          } else if (title.includes('năm')) {
            filter = title.includes('Doanh thu') ? 'thisYear' : 'profitYear';
          } else if (title.includes('hôm nay')) {
            filter = 'today';
          }
          url = `/api/dashboard/details/orders?filter=${filter}`;
        } else if (type === 'inventory') {
          url = '/api/dashboard/details/inventory';
        }

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
          setData(json.data || []);
        } else {
          throw new Error(json.message || 'Lỗi không thể tải dữ liệu chi tiết.');
        }
      } catch (err) {
        console.error('Lỗi khi tải chi tiết khoan sâu:', err);
        setError(err.message || 'Lỗi kết nối máy chủ.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isOpen, type, title]);

  // Step 3: Calculate Grand Total
  const totals = useMemo(() => {
    if (type === 'orders') {
      const totalAmount = data.reduce((sum, item) => {
        const isSuccess = item.status === 'Đã hoàn thành' || item.status === 'Đang giao' || item.status === 'Đang giao hàng';
        return sum + (isSuccess ? Number(item.total || 0) : 0);
      }, 0);
      return { totalAmount };
    } else {
      const totalQty = data.reduce((sum, item) => sum + Number(item.stock || 0), 0);
      const totalValue = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
      return { totalQty, totalValue };
    }
  }, [data, type]);

  // Step 4: Export to Excel
  // Step 4: Export to Excel (Native CSV format)
  const handleExportExcel = () => {
    if (data.length === 0) return;

    let formattedData = [];
    if (type === 'orders') {
      formattedData = data.map(item => ({
        'Mã Đơn': item.code,
        'Ngày': item.date,
        'Khách Hàng': item.customer,
        'Trạng Thái': item.status,
        'Tổng Tiền': item.total
      }));
    } else if (type === 'inventory') {
      formattedData = data.map(item => ({
        'Tên Kính': item.name,
        'SKU': item.sku,
        'Số lượng tồn': item.stock,
        'Giá nhập': item.importPrice,
        'Thành tiền': item.value
      }));
    }

    // 1. Lấy danh sách tiêu đề cột (Headers)
    const headers = Object.keys(formattedData[0]);

    // 2. Map dữ liệu thành từng dòng của CSV
    const csvRows = formattedData.map(row => {
      return headers.map(fieldName => {
        // Rào lỗi: Xử lý chuỗi có chứa dấu phẩy hoặc ngoặc kép để không làm vỡ cột trong Excel
        let cellData = row[fieldName] === null || row[fieldName] === undefined ? '' : row[fieldName].toString();
        if (cellData.includes(',') || cellData.includes('"') || cellData.includes('\n')) {
          cellData = `"${cellData.replace(/"/g, '""')}"`;
        }
        return cellData;
      }).join(',');
    });

    // 3. Ghép Header và Ruột. KÝ TỰ \uFEFF LÀ BẮT BUỘC để Excel không bị lỗi font tiếng Việt!
    const csvContent = '\uFEFF' + headers.join(',') + '\n' + csvRows.join('\n');

    // 4. Tạo Blob và ép trình duyệt tải xuống file .csv
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Tạo tên file an toàn
    const safeTitle = title.replace(/[\/\\?%*:|"<>\s]/g, '_');
    const fileName = `Bao_cao_${safeTitle}_${new Date().getTime()}.csv`;

    // Khởi tạo thẻ <a> ảo để trigger download
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();

    // Dọn dẹp bộ nhớ sau khi tải xong
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
          <Title className="font-black text-slate-800 text-lg">{title}</Title>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={isLoading || data.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white rounded-lg text-xs font-semibold transition shadow-sm outline-none"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition outline-none"
              aria-label="Đóng"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 flex flex-col min-h-0 bg-white">
          {isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              <p className="text-sm font-bold text-slate-400">Đang truy vấn dữ liệu...</p>
            </div>
          )}

          {!isLoading && error && (
            <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-12 h-12 text-rose-500" />
              <p className="text-sm font-black text-rose-600 text-center">{error}</p>
            </div>
          )}

          {!isLoading && !error && data.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-20">
              <Package className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-400">Không tìm thấy dữ liệu phù hợp.</p>
            </div>
          )}

          {!isLoading && !error && data.length > 0 && (
            <div className="overflow-x-auto border border-slate-100 rounded-xl max-h-[60vh] overflow-y-auto relative">
              {type === 'orders' ? (
                <table className="min-w-full whitespace-nowrap divide-y divide-slate-100">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-100">
                    <tr className="text-left text-xs font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Mã Đơn</th>
                      <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Ngày</th>
                      <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Khách Hàng</th>
                      <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10 text-center">Trạng Thái</th>
                      <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10 text-right">
                        {title.includes('Lợi nhuận') ? 'Lợi Nhuận' : 'Tổng Tiền'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-50 text-sm">
                    {data.map((order, idx) => (
                      <tr key={order.code || idx} className="hover:bg-slate-50/50 transition">
                        <td className="py-3.5 px-4 font-bold text-blue-600 font-mono">{order.code}</td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono">{order.date}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-800">{order.customer}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${order.status === 'Đã hoàn thành' ? 'bg-emerald-50 text-emerald-600' :
                            order.status === 'Đang xử lý' ? 'bg-blue-50 text-blue-600' :
                              order.status === 'Đang giao' || order.status === 'Đang giao hàng' ? 'bg-violet-50 text-violet-600' :
                                order.status === 'Chờ xử lý' ? 'bg-amber-50 text-amber-600' :
                                  'bg-rose-50 text-rose-600'
                            }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className={`py-3.5 px-4 text-right font-black font-mono ${(order.status === 'Đã hủy' || order.status === 'Chờ xử lý')
                          ? 'line-through text-slate-300'
                          : 'text-slate-800'
                          }`}>
                          {formatCurrency(order.total)}
                        </td>
                      </tr>
                    ))}
                    {/* Sticky Footer Grand Total */}
                    <tr className="sticky bottom-0 z-10 font-black text-slate-900 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                      <td colSpan={4} className="py-4 px-4 text-xs font-black bg-slate-100 sticky bottom-0 border-t-2 border-slate-200">TỔNG CỘNG ({data.length} ĐƠN HÀNG)</td>
                      <td className="py-4 px-4 text-right font-mono text-base text-blue-700 bg-slate-100 sticky bottom-0 border-t-2 border-slate-200">{formatCurrency(totals.totalAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <table className="min-w-full whitespace-nowrap divide-y divide-slate-100">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-100">
                    <tr className="text-left text-xs font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Tên Kính</th>
                      <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">SKU</th>
                      <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10 text-center">Số lượng tồn</th>
                      <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10 text-right">Giá nhập</th>
                      <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-50 text-sm">
                    {data.map((item, idx) => (
                      <tr key={item.sku || idx} className="hover:bg-slate-50/50 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-800 max-w-xs truncate">{item.name}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-500 font-mono">{item.sku}</td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-700 font-mono">{formatNumber(item.stock)}</td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-500 font-mono">{formatCurrency(item.importPrice)}</td>
                        <td className="py-3.5 px-4 text-right font-black text-emerald-600 font-mono">{formatCurrency(item.value)}</td>
                      </tr>
                    ))}
                    {/* Sticky Footer Grand Total */}
                    <tr className="sticky bottom-0 z-10 font-black text-slate-900 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                      <td colSpan={2} className="py-4 px-4 text-xs font-black bg-slate-100 sticky bottom-0 border-t-2 border-slate-200">TỔNG CỘNG ({data.length} MÃ SẢN PHẨM)</td>
                      <td className="py-4 px-4 text-center font-mono text-base text-slate-700 bg-slate-100 sticky bottom-0 border-t-2 border-slate-200">{formatNumber(totals.totalQty)}</td>
                      <td className="py-4 px-4 text-right font-mono text-base text-slate-500 bg-slate-100 sticky bottom-0 border-t-2 border-slate-200">—</td>
                      <td className="py-4 px-4 text-right font-mono text-base text-emerald-700 bg-slate-100 sticky bottom-0 border-t-2 border-slate-200">{formatCurrency(totals.totalValue)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 flex justify-end border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition shadow-sm outline-none"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
