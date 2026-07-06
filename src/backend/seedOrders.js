const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Sử dụng Schema linh hoạt để đẩy dữ liệu nhanh
const orderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model('Order', orderSchema);

// Danh sách 10 ID sản phẩm thật từ Database
const productIds = [
    "6a0ecaa44ee69dfa36f95e9a", "6a3687c112d6375ff7255190",
    "6a36893c12d6375ff7255191", "6a368b2312d6375ff7255192",
    "6a43c845478e43bb2c324630", "6a43ca80478e43bb2c32463a",
    "6a43cd10478e43bb2c324646", "6a43cddc478e43bb2c324653",
    "6a43d40e478e43bb2c324663", "6a43dad5478e43bb2c324674"
];

// Danh sách khách hàng thực tế
const customers = [
    { name: "Trần Văn Luân", phone: "0901234567", address: "Phường 1, TP. Trà Vinh, Trà Vinh" },
    { name: "Nguyễn Thị Mai", phone: "0912345678", address: "Thị trấn Nhị Long, Vũng Liêm, Vĩnh Long" },
    { name: "Lê Hoàng Nam", phone: "0923456789", address: "Phường An Khánh, Ninh Kiều, Cần Thơ" },
    { name: "Phạm Hữu Trí", phone: "0934567890", address: "Khu dân cư Hưng Phú, Cái Răng, Cần Thơ" },
    { name: "Võ Thanh Thảo", phone: "0945678901", address: "Phường 5, TP. Vĩnh Long, Vĩnh Long" },
    { name: "Đặng Minh Khôi", phone: "0956789012", address: "Trường Đại học Trà Vinh, Trà Vinh" },
    { name: "Bùi Thị Lan", phone: "0967890123", address: "Quận 7, TP. Hồ Chí Minh" },
    { name: "Hồ Chí Dũng", phone: "0978901234", address: "Phường 3, TP. Trà Vinh, Trà Vinh" }
];

// Hàm tạo thời gian ngẫu nhiên trong 10 ngày qua (25/06/2026 - 05/07/2026)
const getRandomDate = () => {
    const start = new Date(2026, 5, 25).getTime(); // Tháng 5 là tháng 6 trong JS (0-indexed)
    const end = new Date(2026, 6, 5).getTime();
    return new Date(start + Math.random() * (end - start));
};

// Hàm lấy giá bán ngẫu nhiên (Giả lập để map với các ID, giá vốn bằng 40% giá bán)
const getPriceObj = () => {
    const prices = [980000, 1500000, 2450000, 3480000];
    const price = prices[Math.floor(Math.random() * prices.length)];
    return { price, importPrice: price * 0.4 };
};

const generateOrders = (count) => {
    const orders = [];
    for (let i = 0; i < count; i++) {
        const customer = customers[Math.floor(Math.random() * customers.length)];
        const pId = productIds[Math.floor(Math.random() * productIds.length)];
        const { price, importPrice } = getPriceObj();
        const hasRx = Math.random() > 0.5; // 50% đơn có cắt kính cận

        // Phân bổ trạng thái để vẽ biểu đồ
        let status = "completed";
        let codStatus = "reconciled";
        let returnPhysicalStatus = "none";
        let cancelReason = undefined;

        const rand = Math.random();
        if (rand < 0.15) {
            // 15% Bom hàng (Cảnh báo đỏ, hàng chưa về kho)
            status = "cancelled";
            codStatus = "pending_return";
            returnPhysicalStatus = "pending";
            cancelReason = ["Khách đổi ý", "Giao không thành công", "Khách báo sai địa chỉ"][Math.floor(Math.random() * 3)];
        } else if (rand < 0.3) {
            // 15% Đang kẹt dòng tiền COD (Shipper chưa nộp)
            status = "shipped";
            codStatus = "pending_submission";
        }

        const orderDate = getRandomDate();

        const order = {
            orderCode: `DH2026${String(i).padStart(4, '0')}`,
            username: "customer",
            customerInfo: customer,
            items: [
                {
                    productId: new mongoose.Types.ObjectId(pId),
                    quantity: 1,
                    priceAtPurchase: price,
                    importPriceAtPurchase: importPrice,
                    originalPriceAtPurchase: price,
                    discountAtPurchase: 0,
                    saleIdAtPurchase: null,
                    hasPrescription: hasRx,
                    od: hasRx ? "SPH: -3.25 | CYL: -0.5 | AXIS: 90" : undefined,
                    os: hasRx ? "SPH: -3.00 | CYL: -0.25 | AXIS: 95" : undefined,
                    prescriptionMode: hasRx ? "saved" : undefined,
                    od_sph: hasRx ? -3.25 : undefined,
                    od_cyl: hasRx ? -0.5 : undefined,
                    od_axis: hasRx ? 90 : undefined,
                    os_sph: hasRx ? -3 : undefined,
                    os_cyl: hasRx ? -0.25 : undefined,
                    os_axis: hasRx ? 95 : undefined,
                    pd: hasRx ? 63 : undefined,
                    rxDate: hasRx ? orderDate : undefined,
                    rxNote: hasRx ? "Cắt kính theo toa mới" : undefined
                }
            ],
            total: price,
            paymentMethod: "cod",
            status: status,
            refundStatus: "none",
            shipperId: Math.random() > 0.5 ? "shipper_dung" : "shipper_long",
            codStatus: codStatus,
            returnPhysicalStatus: returnPhysicalStatus,
            cancelReason: cancelReason,
            stockRestored: status === "cancelled" ? false : undefined, // False để tạo số liệu báo động hàng đọng
            quotaRestored: status === "cancelled" ? false : undefined,
            createdAt: orderDate,
            __v: 0
        };

        orders.push(order);
    }
    return orders;
};

async function seedDatabase() {
    try {
        console.log('⏳ Đang kết nối MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Kết nối thành công!');

        // Dọn dẹp đơn hàng rác hiện tại
        await Order.deleteMany({});
        console.log('🧹 Đã xóa sạch dữ liệu đơn hàng cũ.');

        // Sinh 35 đơn hàng
        const sampleOrders = generateOrders(35);

        await Order.insertMany(sampleOrders);
        console.log(`🎉 Tuyệt vời! Đã nạp thành công 35 đơn hàng mẫu vào Database.`);

        process.exit();
    } catch (error) {
        console.error('❌ Lỗi nạp dữ liệu:', error);
        process.exit(1);
    }
}

seedDatabase();