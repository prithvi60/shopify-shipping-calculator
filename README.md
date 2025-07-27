#Prod Deployment in server

 npm run build
 npx pm2 restart kosherapp
 curl -I https://app.shopifyapp.shop

#Local

shopify app dev
terminal 2 - cloudflared tunnel shopifyapp.shop
