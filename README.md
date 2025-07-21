# 📦 Shopify Custom Shipping App – Webibee x Hamashbir

This is a custom private Shopify app developed by Webibee for Hamashbir to calculate dynamic shipping rates for Fresh, Frozen, and Ambient products. It supports container fitting, dry ice calculation, courier-specific rules, and real-time rate injection into checkout.

---

## 🚀 Tech Stack

- **Remix + Shopify App Bridge**
- **Polaris (Shopify UI)**
- **Prisma + SQLite (dev)**
- **GraphQL Admin API**
- **CarrierService API (for checkout rate calculation)**

---

## 📁 Key Features

 Real-time shipping rate based on:
- Volume, weight, dry ice, and container logic
- Courier zones and weight brackets
- Optional delivery time fees (10AM/12PM)
- VAT and fuel surcharge

 Admin Panel with UI to manage:
- Containers (`/app/containers`)
- Couriers (`/app/couriers`)


 Shopify Checkout Integration via CarrierService API

---

## 🛠️ Local Development

### 1. Install dependencies

```bash
npm install
