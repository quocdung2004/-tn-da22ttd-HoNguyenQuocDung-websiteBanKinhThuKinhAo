import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  BarChart3,
  Clock,
  DollarSign,
  Loader2,
  Package,
  ShoppingBag,
  TrendingUp
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

const initialDashboardData = {
  revenue: {
    today: 0,
    thisMonth: 0,
    thisYear: 0,
    lifetime: 0
  },
  profit: {
    thisMonth: 0,
    thisYear: 0,
    lifetime: 0
  },
  orders: {
    pending: 0,
    processing: 0,
    shipping: 0,
    completed: 0,
    cancelled: 0,
    total: 0
  },
  inventory: {
    totalProducts: 0,
    totalSKU: 0,
    totalStockQuantity: 0,
    outOfStockCount: 0,
    negativeStockCount: 0,
    lowStockCount: 0,
    inventoryValue: 0,
    outOfStockProducts: [],
    lowStockProducts: []
  },
  topProducts: [],
  topCategories: {
    byRevenue: [],
    byQuantity: []
  },
  topBrands: {
    byRevenue: [],
    byQuantity: []
  },
  saleCampaignAnalytics: []
};

const tabs = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'revenue', label: 'Doanh thu' },
  { id: 'inventory', label: 'Tồn kho' }
];

const toneClasses = {
  blue: {
    border: 'border-blue-100',
    background: 'bg-blue-50',
    text: 'text-blue-600'
  },
  emerald: {
    border: 'border-emerald-100',
    background: 'bg-emerald-50',
    text: 'text-emerald-600'
  },
  amber: {
    border: 'border-amber-100',
    background: 'bg-amber-50',
    text: 'text-amber-600'
  },
  red: {
    border: 'border-red-100',
    background: 'bg-red-50',
    text: 'text-red-600'
  },
  slate: {
    border: 'border-slate-200',
    background: 'bg-slate-50',
    text: 'text-slate-700'
  },
  violet: {
    border: 'border-violet-100',
    background: 'bg-violet-50',
    text: 'text-violet-600'
  }
};

const progressClasses = {
  blue: 'bg-blue-600',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-500'
};

const mergeDashboardData = (data) => ({
  ...initialDashboardData,
  ...data,
  revenue: {
    ...initialDashboardData.revenue,
    ...(data?.revenue || {})
  },
  profit: {
    ...initialDashboardData.profit,
    ...(data?.profit || {})
  },
  orders: {
    ...initialDashboardData.orders,
    ...(data?.orders || {})
  },
  inventory: {
    ...initialDashboardData.inventory,
    ...(data?.inventory || {})
  },
  topCategories: {
    ...initialDashboardData.topCategories,
    ...(data?.topCategories || {})
  },
  topBrands: {
    ...initialDashboardData.topBrands,
    ...(data?.topBrands || {})
  },
  topProducts: data?.topProducts || data?.bestSellingProducts || [],
  saleCampaignAnalytics: data?.saleCampaignAnalytics || []
});

const formatCurrency = (value) => (
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(Number(value || 0))
);

const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));

export default function AdminDashboard() {
  const { socket } = useSocket();
  const debounceTimeoutRef = useRef(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState(initialDashboardData);

  const fetchDashboardData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch('/api/admin/dashboard-v2', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể tải dữ liệu Bảng điều khiển.');
      }

      setDashboardData(mergeDashboardData(data));
    } catch (err) {
      console.error('Lỗi tải dữ liệu Bảng điều khiển:', err);
      setError(err.message || 'Không thể kết nối đến máy chủ hoặc tải dữ liệu thống kê.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleDashboardUpdate = () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
        fetchDashboardData({ silent: true });
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
  }, [socket, fetchDashboardData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-55 p-20 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-gray-500 font-bold">Đang tải Bảng điều khiển vận hành...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-20 flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-16 h-16 text-red-500" />
        <p className="text-red-600 font-black text-center text-lg">{error}</p>
        <button
          type="button"
          onClick={() => fetchDashboardData()}
          className="px-6 py-3 bg-gray-900 text-white font-bold rounded-lg hover:bg-blue-600 transition"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const revenue = dashboardData.revenue;
  const profit = dashboardData.profit;
  const orders = dashboardData.orders;
  const inventory = dashboardData.inventory;
  const topProducts = dashboardData.topProducts || [];
  const topCategories = dashboardData.topCategories || initialDashboardData.topCategories;
  const topBrands = dashboardData.topBrands || initialDashboardData.topBrands;
  const campaigns = dashboardData.saleCampaignAnalytics || [];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 pb-24">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Bảng điều khiển vận hành</h1>
            <p className="text-gray-500 mt-1">Theo dõi doanh thu, đơn hàng, tồn kho và chiến dịch bán hàng.</p>
          </div>

          <div className="inline-flex w-full sm:w-auto rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-bold transition ${
                  activeTab === tab.id
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'overview' && (
          <OverviewTab
            revenue={revenue}
            profit={profit}
            orders={orders}
            topProducts={topProducts}
            topBrands={topBrands}
          />
        )}

        {activeTab === 'revenue' && (
          <RevenueTab
            revenue={revenue}
            profit={profit}
            topCategories={topCategories}
            topBrands={topBrands}
            campaigns={campaigns}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryTab inventory={inventory} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ revenue, profit, orders, topProducts, topBrands }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard
          title="Doanh thu hôm nay"
          value={formatCurrency(revenue.today)}
          description="Doanh thu trong ngày"
          icon={DollarSign}
          tone="blue"
        />
        <MetricCard
          title="Doanh thu tháng"
          value={formatCurrency(revenue.thisMonth)}
          description="Doanh thu tháng này"
          icon={BarChart3}
          tone="blue"
        />
        <MetricCard
          title="Doanh thu năm"
          value={formatCurrency(revenue.thisYear)}
          description="Doanh thu năm nay"
          icon={TrendingUp}
          tone="emerald"
        />
        <MetricCard
          title="Lợi nhuận tháng"
          value={formatCurrency(profit.thisMonth)}
          description="Lợi nhuận tháng này"
          icon={TrendingUp}
          tone="emerald"
        />
        <MetricCard
          title="Lợi nhuận năm"
          value={formatCurrency(profit.thisYear)}
          description="Lợi nhuận năm nay"
          icon={Award}
          tone="violet"
        />
      </div>

      <OrderStatusGrid orders={orders} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TopProductsPanel products={topProducts} />
        <ProgressList
          title="Thương hiệu hàng đầu theo doanh thu"
          icon={BarChart3}
          items={topBrands.byRevenue || []}
          valueKey="revenue"
          valueFormatter={formatCurrency}
          accent="blue"
        />
      </div>
    </div>
  );
}

function RevenueTab({ revenue, profit, topCategories, topBrands, campaigns }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Tổng doanh thu"
          value={formatCurrency(revenue.lifetime)}
          description="Doanh thu hợp lệ toàn hệ thống"
          icon={DollarSign}
          tone="blue"
        />
        <MetricCard
          title="Tổng lợi nhuận"
          value={formatCurrency(profit.lifetime)}
          description="Lợi nhuận theo giá vốn"
          icon={TrendingUp}
          tone="emerald"
        />
        <MetricCard
          title="Tháng này"
          value={formatCurrency(revenue.thisMonth)}
          description="Doanh thu tháng hiện tại"
          icon={BarChart3}
          tone="violet"
        />
        <MetricCard
          title="Năm nay"
          value={formatCurrency(revenue.thisYear)}
          description="Doanh thu năm hiện tại"
          icon={Award}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ProgressList
          title="Danh mục hàng đầu theo doanh thu"
          icon={BarChart3}
          items={topCategories.byRevenue || []}
          valueKey="revenue"
          valueFormatter={formatCurrency}
          accent="blue"
        />
        <ProgressList
          title="Danh mục hàng đầu theo số lượng"
          icon={Package}
          items={topCategories.byQuantity || []}
          valueKey="quantitySold"
          valueFormatter={(value) => `${formatNumber(value)} sản phẩm`}
          accent="emerald"
        />
        <ProgressList
          title="Thương hiệu hàng đầu theo doanh thu"
          icon={BarChart3}
          items={topBrands.byRevenue || []}
          valueKey="revenue"
          valueFormatter={formatCurrency}
          accent="violet"
        />
        <ProgressList
          title="Thương hiệu hàng đầu theo số lượng"
          icon={Package}
          items={topBrands.byQuantity || []}
          valueKey="quantitySold"
          valueFormatter={(value) => `${formatNumber(value)} sản phẩm`}
          accent="amber"
        />
      </div>

      <CampaignAnalytics campaigns={campaigns} />
    </div>
  );
}

function InventoryTab({ inventory }) {
  return (
    <div className="space-y-6">
      {Number(inventory.negativeStockCount || 0) > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-700 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          Có dữ liệu tồn kho âm cần kiểm tra
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard
          title="Tổng sản phẩm"
          value={formatNumber(inventory.totalProducts)}
          description="Tổng sản phẩm trong hệ thống"
          icon={Package}
          tone="slate"
        />
        <MetricCard
          title="Tổng SKU"
          value={formatNumber(inventory.totalSKU)}
          description="SKU đang hoạt động"
          icon={Package}
          tone="blue"
        />
        <MetricCard
          title="Số lượng tồn kho"
          value={formatNumber(inventory.totalStockQuantity)}
          description="Tổng số lượng tồn"
          icon={ShoppingBag}
          tone="emerald"
        />
        <MetricCard
          title="Giá trị tồn kho"
          value={formatCurrency(inventory.inventoryValue)}
          description="Số lượng tồn * Giá nhập"
          icon={DollarSign}
          tone="violet"
        />
        <MetricCard
          title="Hết hàng"
          value={formatNumber(inventory.outOfStockCount)}
          description="Sản phẩm hết hàng"
          icon={AlertCircle}
          tone="red"
        />
        <MetricCard
          title="Sắp hết hàng"
          value={formatNumber(inventory.lowStockCount)}
          description="Tồn kho từ 1 đến 5"
          icon={Clock}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <StockList
          title="Sản phẩm hết hàng"
          products={inventory.outOfStockProducts || []}
          emptyText="Không có sản phẩm hết hàng."
          tone="red"
        />
        <StockList
          title="Sản phẩm sắp hết hàng"
          products={inventory.lowStockProducts || []}
          emptyText="Không có sản phẩm sắp hết hàng."
          tone="amber"
        />
      </div>
    </div>
  );
}

function MetricCard({ title, value, description, icon: Icon, tone = 'blue' }) {
  const toneClass = toneClasses[tone] || toneClasses.blue;

  return (
    <div className={`bg-white border ${toneClass.border} rounded-lg p-5 shadow-sm`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-gray-500">{title}</p>
          <p className="mt-2 text-2xl font-black text-gray-900 break-words">{value}</p>
          <p className="mt-1 text-xs font-semibold text-gray-400">{description}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneClass.background} ${toneClass.text} flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function OrderStatusGrid({ orders }) {
  const statuses = [
    { label: 'Đơn hàng chờ xử lý', value: orders.pending, icon: Clock, tone: 'amber' },
    { label: 'Đơn hàng đang xử lý', value: orders.processing, icon: ShoppingBag, tone: 'blue' },
    { label: 'Đơn hàng đang giao', value: orders.shipping, icon: Package, tone: 'violet' },
    { label: 'Đơn hàng đã hoàn thành', value: orders.completed, icon: Award, tone: 'emerald' },
    { label: 'Đơn hàng đã hủy', value: orders.cancelled, icon: AlertCircle, tone: 'red' }
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-black text-gray-900">Quy trình xử lý đơn hàng</h2>
        <span className="text-sm font-bold text-gray-500">Tổng cộng: {formatNumber(orders.total)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {statuses.map((status) => (
          <MetricCard
            key={status.label}
            title={status.label}
            value={formatNumber(status.value)}
            description="Số đơn theo trạng thái"
            icon={status.icon}
            tone={status.tone}
          />
        ))}
      </div>
    </div>
  );
}

function TopProductsPanel({ products }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm">
      <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-amber-500" />
        Sản phẩm bán chạy
      </h2>

      {products.length === 0 ? (
        <EmptyState text="Chưa có dữ liệu sản phẩm bán chạy." />
      ) : (
        <div className="space-y-3">
          {products.slice(0, 5).map((product, index) => (
            <div key={product._id || index} className="flex items-center gap-4 rounded-lg border border-gray-100 p-3">
              <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-black flex-shrink-0">
                {index + 1}
              </div>
              <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {product.images?.[0] ? (
                  <img src={product.images[0]} alt="" className="w-full h-full object-contain" />
                ) : (
                  <Package className="w-6 h-6 text-gray-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-gray-900 truncate">{product.name}</h3>
                <p className="text-xs font-semibold text-gray-500">{formatCurrency(product.revenue)} doanh thu</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-black text-blue-600">{formatNumber(product.sold)}</p>
                <p className="text-[10px] uppercase font-black text-gray-400">đã bán</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressList({ title, icon: Icon, items, valueKey, valueFormatter, accent = 'blue' }) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 0);
  const progressClass = progressClasses[accent] || progressClasses.blue;

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm">
      <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
        <Icon className="w-5 h-5 text-gray-700" />
        {title}
      </h2>

      {items.length === 0 ? (
        <EmptyState text="Chưa có dữ liệu." />
      ) : (
        <div className="space-y-4">
          {items.slice(0, 8).map((item, index) => {
            const value = Number(item[valueKey] || 0);
            const percent = maxValue > 0 ? (value / maxValue) * 100 : 0;

            return (
              <div key={item._id || item.name || index}>
                <div className="flex items-end justify-between gap-3 mb-2">
                  <span className="font-bold text-gray-900 truncate">{item.name}</span>
                  <span className="text-sm font-black text-gray-600 flex-shrink-0">{valueFormatter(value)}</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
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

function CampaignAnalytics({ campaigns }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm overflow-hidden">
      <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-blue-600" />
        Phân tích chiến dịch khuyến mãi
      </h2>

      {campaigns.length === 0 ? (
        <EmptyState text="Chưa có chiến dịch khuyến mãi để thống kê." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="py-3 pr-4 font-black">Chiến dịch</th>
                <th className="py-3 px-4 font-black">Đã dùng</th>
                <th className="py-3 px-4 font-black">Còn lại</th>
                <th className="py-3 px-4 font-black">Đơn hàng</th>
                <th className="py-3 pl-4 font-black text-right">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 10).map((campaign) => (
                <tr key={campaign._id} className="border-b border-gray-50 last:border-0">
                  <td className="py-4 pr-4">
                    <div className="font-black text-gray-900">{campaign.name}</div>
                    <div className="text-xs font-semibold text-gray-400">
                      {campaign.discountType === 'percent' ? `${campaign.discountValue}%` : formatCurrency(campaign.discountValue)}
                    </div>
                  </td>
                  <td className="py-4 px-4 font-bold text-gray-700">{formatNumber(campaign.usedCount)}</td>
                  <td className="py-4 px-4 font-bold text-gray-700">
                    {campaign.usageLimitType === 'limited' ? formatNumber(campaign.remainingCount) : 'Không giới hạn'}
                  </td>
                  <td className="py-4 px-4 font-bold text-gray-700">{formatNumber(campaign.ordersGenerated)}</td>
                  <td className="py-4 pl-4 text-right font-black text-blue-600">{formatCurrency(campaign.revenueGenerated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StockList({ title, products, emptyText, tone = 'amber' }) {
  const toneClass = toneClasses[tone] || toneClasses.amber;

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-sm">
      <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
        <Package className={`w-5 h-5 ${toneClass.text}`} />
        {title}
      </h2>

      {products.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        <div className="space-y-3">
          {products.slice(0, 12).map((product, index) => (
            <div key={product._id || index} className="flex items-center gap-4 rounded-lg border border-gray-100 p-3">
              <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {product.images?.[0] ? (
                  <img src={product.images[0]} alt="" className="w-full h-full object-contain" />
                ) : (
                  <Package className="w-5 h-5 text-gray-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-gray-900 truncate">{product.name}</h3>
                <p className="text-xs font-semibold text-gray-500">
                  Giá vốn: {formatCurrency(product.importPrice)} · Giá trị kho: {formatCurrency(product.inventoryValue)}
                </p>
              </div>
              <div className={`${toneClass.background} ${toneClass.text} px-3 py-1 rounded-full text-xs font-black flex-shrink-0`}>
                Tồn kho: {formatNumber(product.stock)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 px-4 text-center text-sm font-bold text-gray-400">
      {text}
    </div>
  );
}
