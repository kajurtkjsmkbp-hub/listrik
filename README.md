# KwhPulse

Website monitoring pengeluaran listrik pulsa KWH berbasis HTML, CSS, dan JavaScript.

## Menjalankan lokal

```powershell
python -m http.server 8000
```

Buka `http://127.0.0.1:8000/`. Root otomatis diarahkan ke halaman login.

Demo login:

- Username: `admin`
- Password: `admin123`

Data aplikasi disimpan di `localStorage` browser. Reset Data menghapus seluruh histori dan data demo tidak tersedia.

## Deploy ke LXC Proxmox dengan Nginx

1. Buat LXC Debian atau Ubuntu.
2. Install Git dan Nginx:

```bash
sudo apt update
sudo apt install -y git nginx
```

3. Clone repository ke web root:

```bash
sudo rm -rf /var/www/kwhpulse
sudo git clone URL_REPOSITORY_GITHUB /var/www/kwhpulse
sudo chown -R www-data:www-data /var/www/kwhpulse
```

4. Salin konfigurasi Nginx:

```bash
sudo cp /var/www/kwhpulse/deploy/kwhpulse.nginx /etc/nginx/sites-available/kwhpulse
sudo ln -s /etc/nginx/sites-available/kwhpulse /etc/nginx/sites-enabled/kwhpulse
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

5. Akses melalui alamat IP LXC, misalnya `http://192.168.1.50/`.

## Update aplikasi

```bash
cd /var/www/kwhpulse
sudo git pull
sudo systemctl reload nginx
```

## Catatan keamanan

Login saat ini adalah login demo client-side dan data tersimpan di browser. Cocok untuk pemakaian pribadi atau jaringan lokal. Untuk akses publik, gunakan backend, database, HTTPS, dan autentikasi server-side.
