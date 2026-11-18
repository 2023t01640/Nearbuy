export const categories = ['All items', 'Electronics', 'Furniture', 'Vehicles', 'Fashion', 'Sports', 'Books & Hobbies'];
export const photo = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=80`;
export const seedListings = [
  ['Sony WH-1000XM4 headphones', 48500, 'Electronics', 'Colombo 05', 'photo-1546435770-a3e426bf472b', 'Like new', 'Nimal Perera'],
  ['Teak lounge chair', 18500, 'Furniture', 'Nugegoda', 'photo-1567538096630-e0c55bd6374c', 'Good', 'Amaya Silva'],
  ['Canon EOS 2000D camera', 112000, 'Electronics', 'Kandy', 'photo-1516035069371-29a1b244cc32', 'Like new', 'Kasun Fernando'],
  ['Giant Escape city bicycle', 65000, 'Vehicles', 'Dehiwala', 'photo-1485965120184-e220f721d03e', 'Good', 'Nimal Perera'],
  ['Everyday canvas backpack', 4200, 'Fashion', 'Galle', 'photo-1553062407-98eeb64c6a62', 'New', 'Tharushi Jayasuriya'],
  ['Acoustic guitar with case', 24500, 'Books & Hobbies', 'Moratuwa', 'photo-1510915361894-db8b60106cb1', 'Good', 'Dinuka de Silva'],
  ['Minimal oak study desk', 22000, 'Furniture', 'Colombo 07', 'photo-1518455027359-f3f8164ba6bd', 'Like new', 'Nimal Perera'],
  ['Adidas running shoes · size 42', 8900, 'Sports', 'Negombo', 'photo-1542291026-7eec264c27ff', 'Like new', 'Sachini Dias'],
  ['Weekend reading collection', 3500, 'Books & Hobbies', 'Peradeniya', 'photo-1495446815901-a7297e633e8d', 'Good', 'Amaya Silva'],
].map((a, i) => ({id: String(i + 1), title:a[0], price:a[1], category:a[2], location:a[3], images:[photo(a[4]), photo(a[4])+'&sat=-50'], condition:a[5], seller:a[6], owner: a[6] === 'Nimal Perera' ? 'seller' : `user-${i}`, status:'active', flagged:i===4, description:'Well cared for and ready for a new home. Everything works as expected; please see the photos for the condition. You are welcome to inspect before buying. Collection can be arranged in '+a[3]+'. Price is slightly negotiable.', createdAt:'2026-11-18T08:30:00', views:124+i*17}));
export const seedUsers = [{id:'seller',name:'Nimal Perera',email:'nimal@example.lk',role:'Seller',status:'active'}, {id:'buyer',name:'Amaya Silva',email:'amaya@example.lk',role:'Buyer',status:'active'}, {id:'user-4',name:'Tharushi Jayasuriya',email:'tharushi@example.lk',role:'Seller',status:'active'}];
export const money = n => 'Rs. ' + Number(n).toLocaleString('en-LK');
