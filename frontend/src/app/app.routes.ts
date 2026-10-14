import { Routes } from '@angular/router';

import { adminGuard, guestOnlyGuard } from './core/admin.guard';

export const routes: Routes = [
  {
    path: 'admin/login',
    canActivate: [guestOnlyGuard],
    title: 'Admin sign in',
    loadComponent: () => import('./admin/login/admin-login').then((m) => m.AdminLogin),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        title: 'Dashboard',
        loadComponent: () => import('./admin/dashboard/admin-dashboard').then((m) => m.AdminDashboard),
      },
      {
        path: 'products',
        title: 'Products',
        loadComponent: () => import('./admin/products/product-list').then((m) => m.AdminProductList),
      },
      {
        path: 'products/:id',
        title: 'Edit product',
        loadComponent: () => import('./admin/products/product-form').then((m) => m.AdminProductForm),
      },
      {
        path: 'categories',
        title: 'Categories',
        loadComponent: () => import('./admin/categories/admin-categories').then((m) => m.AdminCategories),
      },
      {
        path: 'collections',
        title: 'Collections',
        loadComponent: () => import('./admin/collections/admin-collections').then((m) => m.AdminCollections),
      },
      {
        path: 'delivery',
        title: 'Delivery',
        loadComponent: () => import('./admin/delivery/admin-delivery').then((m) => m.AdminDelivery),
      },
      {
        path: 'coupons',
        title: 'Coupons',
        loadComponent: () => import('./admin/coupons/admin-coupons').then((m) => m.AdminCoupons),
      },
      {
        path: 'inventory',
        title: 'Inventory',
        loadComponent: () => import('./admin/inventory/admin-inventory').then((m) => m.AdminInventory),
      },
      {
        path: 'orders',
        title: 'Orders',
        loadComponent: () => import('./admin/orders/order-list').then((m) => m.AdminOrderList),
      },
      {
        path: 'orders/:id',
        title: 'Order',
        loadComponent: () => import('./admin/orders/order-detail').then((m) => m.AdminOrderDetailPage),
      },
      {
        path: 'customers',
        title: 'Customers',
        loadComponent: () => import('./admin/customers/customer-list').then((m) => m.AdminCustomerList),
      },
      {
        path: 'customers/:id',
        title: 'Customer',
        loadComponent: () => import('./admin/customers/customer-detail').then((m) => m.AdminCustomerDetailPage),
      },
      {
        path: 'suppliers',
        title: 'Suppliers',
        loadComponent: () => import('./admin/suppliers/admin-suppliers').then((m) => m.AdminSuppliers),
      },
      {
        path: 'supplier-bills',
        title: 'Supplier bills',
        loadComponent: () => import('./admin/suppliers/bill-list').then((m) => m.AdminBillList),
      },
      {
        path: 'supplier-bills/new',
        title: 'Record supplier bill',
        loadComponent: () => import('./admin/suppliers/bill-form').then((m) => m.AdminBillForm),
      },
      {
        path: 'supplier-bills/:id',
        title: 'Supplier bill',
        loadComponent: () => import('./admin/suppliers/bill-detail').then((m) => m.AdminBillDetail),
      },
      {
        path: 'account',
        title: 'My account',
        loadComponent: () => import('./admin/account/admin-account').then((m) => m.AdminAccount),
      },
      {
        path: 'reports',
        title: 'Reports',
        loadComponent: () => import('./admin/reports/admin-reports').then((m) => m.AdminReports),
      },
    ],
  },
  {
    path: '',
    loadComponent: () =>
      import('./storefront/layout/storefront-layout').then((m) => m.StorefrontLayout),
    children: [
      {
        path: '',
        loadComponent: () => import('./storefront/home/home').then((m) => m.Home),
      },
      {
        path: 'shop',
        loadComponent: () => import('./storefront/shop/shop').then((m) => m.Shop),
      },
      {
        path: 'shop/:category',
        loadComponent: () => import('./storefront/shop/shop').then((m) => m.Shop),
      },
      {
        path: 'collections',
        loadComponent: () => import('./storefront/collections/collections').then((m) => m.Collections),
      },
      {
        path: 'collections/:collection',
        loadComponent: () => import('./storefront/shop/shop').then((m) => m.Shop),
      },
      {
        path: 'products/:slug',
        loadComponent: () => import('./storefront/product/product-detail').then((m) => m.ProductDetail),
      },
      {
        path: 'cart',
        loadComponent: () => import('./storefront/cart/cart').then((m) => m.Cart),
      },
      {
        path: 'checkout',
        loadComponent: () => import('./storefront/checkout/checkout').then((m) => m.Checkout),
      },
      {
        path: 'order/:token',
        loadComponent: () =>
          import('./storefront/order-confirmation/order-confirmation').then((m) => m.OrderConfirmation),
      },
      {
        path: 'account',
        loadComponent: () => import('./storefront/account/account-page').then((m) => m.AccountPage),
      },
      {
        path: 'account/login',
        loadComponent: () => import('./storefront/account/sign-in').then((m) => m.AccountSignIn),
      },
      {
        path: 'account/register',
        loadComponent: () => import('./storefront/account/register').then((m) => m.AccountRegister),
      },
      {
        path: 'track',
        loadComponent: () => import('./storefront/track-order/track-order').then((m) => m.TrackOrder),
      },
      {
        path: 'track/:token',
        loadComponent: () => import('./storefront/track-order/track-order').then((m) => m.TrackOrder),
      },
      {
        path: 'pages/:slug',
        loadComponent: () => import('./storefront/pages/static-page').then((m) => m.StaticPageView),
      },
      {
        path: '**',
        title: 'Page not found',
        loadComponent: () => import('./shared/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];
