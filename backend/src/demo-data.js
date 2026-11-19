// Fictional presentation fixtures. These credentials must never be enabled in production.
export const demoPassword = "NearBuy-Demo-2026!";
export const demoAccounts = [
  {
    key: "admin",
    name: "NearBuy Admin",
    email: "admin@nearbuy.local",
    role: "admin",
    location: "Colombo",
    label: "System Admin",
  },
  {
    key: "seller-colombo",
    name: "Nimal Perera",
    email: "nimal@demo.nearbuy.local",
    role: "seller",
    location: "Colombo",
    label: "Verified Seller",
  },
  {
    key: "seller-kandy",
    name: "Dilani Wijesinghe",
    email: "dilani@demo.nearbuy.local",
    role: "seller",
    location: "Kandy",
  },
  {
    key: "seller-galle",
    name: "Kasun Fernando",
    email: "kasun@demo.nearbuy.local",
    role: "seller",
    location: "Galle",
  },
  {
    key: "buyer-amaya",
    name: "Amaya Silva",
    email: "amaya@demo.nearbuy.local",
    role: "buyer",
    location: "Nugegoda",
    label: "Demo Buyer",
  },
  {
    key: "buyer-tharindu",
    name: "Tharindu Jayasinghe",
    email: "tharindu@demo.nearbuy.local",
    role: "buyer",
    location: "Peradeniya",
  },
];
export const demoListings = [
  {
    key: "headphones",
    seller: "seller-colombo",
    title: "Sony WH-1000XM4 wireless headphones",
    category: "Electronics",
    price: 48500,
    location: "Colombo 05",
    condition: "Like new",
    photo: "photo-1546435770-a3e426bf472b",
    specs: {
      Brand: "Sony",
      Model: "WH-1000XM4",
      Colour: "Black",
      Connectivity: "Bluetooth / 3.5 mm",
      Includes: "Carry case, USB-C cable",
    },
    description:
      "Gently used noise-cancelling headphones, ideal for lectures, working from home and the daily train ride. Battery comfortably lasts a full day of use. Ear cushions are clean and all controls work. Includes the original carry case and charging cable. You are welcome to test them before collecting in Havelock Town.",
    question:
      "Hi Nimal! Could I test the noise cancellation before collecting?",
    reply:
      "Of course, Amaya. We can meet near Havelock City Mall after 5 pm. I will bring the case and charging cable.",
    review:
      "Nimal answered every question and let me test the headphones carefully. The condition matched the description. Very easy to arrange collection.",
    rating: 5,
  },
  {
    key: "camera",
    seller: "seller-galle",
    title: "Canon EOS 2000D with 18–55 mm lens",
    category: "Electronics",
    price: 112000,
    location: "Galle",
    condition: "Good",
    photo: "photo-1516035069371-29a1b244cc32",
    specs: {
      Brand: "Canon",
      Model: "EOS 2000D",
      Sensor: "24.1 MP APS-C",
      Lens: "18–55 mm",
      Includes: "Battery, charger, camera bag",
    },
    description:
      "A practical first interchangeable-lens camera for photography students and weekend trips along the southern coast. The lens is clear, autofocus works well and the battery holds its charge. Small cosmetic marks on the body from normal use. Includes a padded bag and charger. Inspection available near Galle Fort; no advance payment needed.",
    question: "Is the charger included, and can I try taking a few photos?",
    reply:
      "Yes, the original charger and camera bag are included. Bring an SD card and you can try the camera when we meet near Galle Fort.",
    review:
      "Helpful seller with clear information about the camera. I was able to inspect the lens and controls without being rushed.",
    rating: 5,
  },
  {
    key: "books",
    seller: "seller-kandy",
    title: "University reading bundle · 8 paperbacks",
    category: "Books & Hobbies",
    price: 4200,
    location: "Kandy",
    condition: "Good",
    photo: "photo-1495446815901-a7297e633e8d",
    specs: {
      Quantity: "8 books",
      Language: "English",
      Format: "Paperback",
      Condition: "Clean pages, light cover wear",
    },
    description:
      "A varied reading bundle for your next semester: contemporary fiction, personal development and introductory business reading. All eight books are complete with clean pages; two have a name written inside the front cover. Selling the bundle together to clear my bookshelf. Collection near Kandy City Centre or Peradeniya by arrangement.",
    question: "Are there any missing pages or highlighted chapters?",
    reply:
      "No missing pages. Two books have a name inside, but the reading pages are clean. Happy to send you the full title list.",
    review:
      "Dilani was honest about the cover wear and shared a detailed title list. A lovely collection at a fair price.",
    rating: 4,
  },
  {
    key: "guitar",
    seller: "seller-galle",
    title: "Acoustic guitar with padded carry bag",
    category: "Books & Hobbies",
    price: 24500,
    location: "Galle",
    condition: "Good",
    photo: "photo-1510915361894-db8b60106cb1",
    specs: {
      Type: "Steel-string acoustic",
      Size: "Full size",
      Strings: "6",
      Includes: "Padded bag and spare picks",
    },
    description:
      "Warm-sounding full-size acoustic guitar, suitable for a beginner or university music society practice. Fresh strings fitted recently, with comfortable action and working tuning pegs. A small surface mark near the lower edge does not affect playability. Comes with a padded carry bag and picks. Try it in person before buying.",
    question: "Would this suit a beginner? Is the action comfortable?",
    reply:
      "Yes, it has a comfortable action and I recently replaced the strings. You are welcome to play it for a while before deciding.",
    review:
      "Kasun explained the condition clearly and gave me time to try a few chords. Friendly and responsive throughout.",
    rating: 5,
  },
  {
    key: "backpack",
    seller: "seller-colombo",
    title: "Canvas campus backpack · olive green",
    category: "Fashion",
    price: 3900,
    location: "Colombo 03",
    condition: "Like new",
    photo: "photo-1553062407-98eeb64c6a62",
    specs: {
      Material: "Woven fabric",
      Colour: "Navy blue",
      Capacity: "Approx. 20 L",
      Laptop: "Up to 14 inches",
    },
    description:
      "Lightweight fabric backpack with a padded laptop section and two handy side pockets. Used for one short course and kept clean in a smoke-free home. Zips and straps are in excellent condition. A useful everyday bag for campus or a weekend trip. Pickup in Kollupitiya; measurements available on request.",
    question: "Will a 14-inch laptop fit in the padded compartment?",
    reply:
      "Yes, I used it with a 14-inch laptop. You can bring yours to check the fit before collecting in Kollupitiya.",
    review:
      "Quick replies and useful measurements. The bag was clean and exactly as described when I inspected it.",
    rating: 5,
  },
  {
    key: "watch",
    seller: "seller-kandy",
    title: "Classic analogue wristwatch · brown strap",
    category: "Fashion",
    price: 6500,
    location: "Kandy",
    condition: "Like new",
    photo: "photo-1524805444758-089113d48a6d",
    specs: {
      Movement: "Quartz",
      Strap: "Brown leather",
      Dial: "Analogue",
      Battery: "Replaced recently",
    },
    description:
      "Simple everyday analogue watch with a brown leather strap and a clean, easy-to-read face. Keeps time accurately; the battery was replaced recently. Light signs of use on the strap. Selling because it is rarely worn. Available to inspect in central Kandy. Stock photograph is representative; inspect the item before purchase.",
    question: "Has the battery been replaced recently?",
    reply:
      "Yes, the battery was changed last month and it keeps time well. You can inspect the strap and face in daylight when we meet.",
    review:
      "Dilani was clear about the strap wear and answered promptly. Smooth communication and a fair asking price.",
    rating: 4,
  },
  {
    key: "chair",
    seller: "seller-colombo",
    title: "Upholstered accent chair � cream",
    category: "Furniture",
    price: 18500,
    location: "Colombo 07",
    condition: "Good",
    photo: "photo-1567538096630-e0c55bd6374c",
    specs: {
      Frame: "Timber legs",
      Upholstery: "Cream fabric",
      Style: "Button-back accent chair",
      Collection: "Buyer-arranged transport",
    },
    description:
      "Comfortable lounge chair from our reading corner. The frame is sturdy with no loose joints, and the cream upholstery has been freshly cleaned. Minor surface wear is visible on one arm. A good fit for a small apartment or study area. Collection from Cinnamon Gardens; please arrange suitable transport.",
    question:
      "Could you share the width? I need to check my apartment doorway.",
    reply:
      "The widest point is about 72 cm. I can help carry it to your vehicle, but please arrange transport for collection.",
    review:
      "Nimal provided measurements and useful collection details. The chair felt sturdy when inspected; the small mark was disclosed in advance.",
    rating: 5,
  },
  {
    key: "desk",
    seller: "seller-kandy",
    title: "Compact white study desk",
    category: "Furniture",
    price: 22000,
    location: "Kandy",
    condition: "Like new",
    photo: "photo-1518455027359-f3f8164ba6bd",
    specs: {
      Width: "120 cm",
      Depth: "60 cm",
      Height: "75 cm",
      Finish: "White tabletop",
      Assembly: "Legs removable for transport",
    },
    description:
      "Compact study desk with enough space for a laptop, monitor and notebooks. The top is clean and the legs are stable. Used in a home study for six months. Legs can be removed for easier transport and all fittings are included. Collection near Peradeniya Road; viewing can be arranged on weekday evenings.",
    question: "Can the legs be removed so the desk fits in a small car?",
    reply:
      "Yes, all four legs unbolt. I can have the tools ready and label the fittings for you. The top is 120 by 60 cm.",
    review:
      "Detailed measurements and quick replies made planning collection easy. A well-kept desk and a considerate seller.",
    rating: 5,
  },
  {
    key: "shoes",
    seller: "seller-galle",
    title: "Running shoes · UK size 8",
    category: "Sports",
    price: 8900,
    location: "Galle",
    condition: "Like new",
    photo: "photo-1542291026-7eec264c27ff",
    specs: {
      Size: "UK 8 / EU 42",
      Colour: "Red",
      Use: "Road running / gym",
      Condition: "Lightly worn",
    },
    description:
      "Lightweight running shoes worn for a few short walks only; selling because the fit is a little tight for me. Soles have plenty of tread and the uppers are clean. Suitable for road running or gym use. Please try them on before buying. Collection near Karapitiya; price is slightly negotiable.",
    question: "Would it be possible to try these on before deciding?",
    reply:
      "Certainly. Please bring your usual running socks so you can check the fit properly. I am near Karapitiya on Saturday morning.",
    review:
      "Kasun encouraged me to check the fit and was flexible with the meeting time. Clear photos and friendly communication.",
    rating: 4,
  },
  {
    key: "yoga",
    seller: "seller-colombo",
    title: "Exercise mat and yoga starter set",
    category: "Sports",
    price: 5500,
    location: "Colombo 05",
    condition: "Good",
    photo: "photo-1544367567-0f2fcb009e0b",
    specs: {
      Mat: "Non-slip exercise mat",
      Thickness: "6 mm",
      Includes: "Carry strap and two foam blocks",
      Use: "Yoga / home workouts",
    },
    description:
      "A simple starter set for yoga or home workouts: a comfortable non-slip mat, carry strap and two foam blocks. Everything has been cleaned and stored indoors. The mat has light impressions from normal use but no tears. Ideal for a student room or small home exercise space. Pickup in Havelock Town.",
    question: "Are the blocks and carry strap included in the price?",
    reply:
      "Yes, the full set is included for Rs. 5,500. I will have everything cleaned and packed for collection.",
    review:
      "The seller answered quickly and clearly listed everything in the set. Very helpful when arranging a convenient pickup time.",
    rating: 5,
  },
];
