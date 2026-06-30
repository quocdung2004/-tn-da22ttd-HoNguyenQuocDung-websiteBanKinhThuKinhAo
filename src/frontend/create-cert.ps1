# Script tạo self-signed certificate cho dev local
# Chạy file này bằng: powershell -ExecutionPolicy Bypass -File create-cert.ps1

$certDir = "D:\baiTapCuaDung\KLTN\frontend\certs"
if (!(Test-Path $certDir)) { New-Item -ItemType Directory -Path $certDir }

$pfxPath = "$certDir\dev-cert.pfx"
$certPem = "$certDir\cert.pem"
$keyPem  = "$certDir\key.pem"

Write-Host "Tao self-signed certificate..." -ForegroundColor Cyan

$cert = New-SelfSignedCertificate `
  -DnsName "localhost", "192.168.1.180" `
  -CertStoreLocation "cert:\CurrentUser\My" `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -NotAfter (Get-Date).AddYears(2) `
  -FriendlyName "DungGlasses Dev"

$pwd = ConvertTo-SecureString -String "devpass" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null

Write-Host "Da tao cert: $pfxPath" -ForegroundColor Green
Write-Host "Thumbprint: $($cert.Thumbprint)" -ForegroundColor Yellow

# Export PEM bang certutil (co san tren Windows)
& certutil -exportPFX -p "devpass" MY $cert.Thumbprint "$pfxPath" | Out-Null

Write-Host ""
Write-Host "=== HUONG DAN CAI TREN DIEN THOAI ANDROID ===" -ForegroundColor Magenta
Write-Host "1. Copy file: $pfxPath" -ForegroundColor White
Write-Host "2. Gui file nay sang dien thoai (qua Zalo, Google Drive...)" -ForegroundColor White
Write-Host "3. Mo file tren dien thoai -> Install certificate" -ForegroundColor White
Write-Host "4. Chon 'VPN and apps' hoac 'Wi-Fi' khi duoc hoi" -ForegroundColor White
Write-Host "5. Password cua cert la: devpass" -ForegroundColor Yellow
Write-Host "6. Sau khi cai xong, truy cap https://192.168.1.180:5173 la OK" -ForegroundColor Green
