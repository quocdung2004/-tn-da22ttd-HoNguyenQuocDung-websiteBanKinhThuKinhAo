const crypto = require('crypto');

const getPaymentCancelSecret = () => (
  process.env.PAYMENT_CANCEL_SECRET ||
  process.env.JWT_SECRET ||
  process.env.PAYOS_CHECKSUM_KEY
);

const buildPaymentCancelToken = (orderCode) => {
  const secret = getPaymentCancelSecret();
  if (!secret || !orderCode) return null;

  return crypto
    .createHmac('sha256', secret)
    .update(String(orderCode))
    .digest('hex');
};

const isValidPaymentCancelToken = (orderCode, token) => {
  if (!token) return false;

  const expectedToken = buildPaymentCancelToken(orderCode);
  if (!expectedToken || expectedToken.length !== String(token).length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedToken),
    Buffer.from(String(token))
  );
};

module.exports = {
  buildPaymentCancelToken,
  isValidPaymentCancelToken
};
