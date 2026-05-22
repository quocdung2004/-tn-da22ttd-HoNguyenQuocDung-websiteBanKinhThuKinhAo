/**
 * Tạo self-signed certificate bằng Node.js (không cần openssl hay mkcert)
 * Cert này có SAN cho IP 192.168.1.180 để điện thoại có thể truy cập
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Dùng PowerShell để tạo cert (có sẵn trên Windows)
const certDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certDir)) fs.mkdirSync(certDir);

const certPath = path.join(certDir, 'cert.pem');
const keyPath  = path.join(certDir, 'key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('✅ Cert đã tồn tại, bỏ qua.');
  process.exit(0);
}

// Dùng PowerShell New-SelfSignedCertificate + Export
const ps = `
$cert = New-SelfSignedCertificate \`
  -DnsName "localhost","192.168.1.180" \`
  -CertStoreLocation "cert:\\CurrentUser\\My" \`
  -KeyAlgorithm RSA \`
  -KeyLength 2048 \`
  -NotAfter (Get-Date).AddYears(2) \`
  -FriendlyName "DungGlasses Dev"

$pwd = ConvertTo-SecureString -String "devpass" -Force -AsPlainText
$pfxPath = "$env:TEMP\\dev-cert.pfx"
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null
Write-Host "PFX exported to $pfxPath"
Write-Host $cert.Thumbprint
`;

try {
  const result = execSync(`powershell -Command "${ps.replace(/\n/g, ' ')}"`, { encoding: 'utf8' });
  console.log('PowerShell result:', result);
  
  // Dùng @vitejs/plugin-basic-ssl vẫn là cách đơn giản nhất
  // Thay vào đó hướng dẫn user install cert trên điện thoại
  console.log('\n📱 Để fix trên điện thoại, làm theo hướng dẫn bên dưới.');
} catch (e) {
  console.error('Lỗi:', e.message);
}
