export interface MenuItemSize {
  name: string;
  price: number;
  enabled: boolean;
}

export interface MenuItemOptionChoice {
  name: string;
  extraPrice: number;
  available: boolean;
}

export interface MenuItemOptionGroup {
  groupName: string;
  required: boolean;
  choices: MenuItemOptionChoice[];
}

export interface MenuItem {
  id: string;
  name: string;
  nameEn?: string;
  price: number;
  category: string;
  description?: string;
  descriptionEn?: string;
  imageKey?: string;
  imageUrl?: string;
  stock?: number | null;
  sizes?: MenuItemSize[];
  options?: MenuItemOptionGroup[];
  riceTypes?: MenuItemOptionChoice[];
  additions?: MenuItemOptionChoice[];
  calories?: number | null;
  walkingMinutes?: number | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  nameEn?: string;
  icon: string;
  items: MenuItem[];
  isDelivery?: boolean;
  isDhabiha?: boolean;
  isOccasions?: boolean;
}

export const RESTAURANT_INFO = {
  name: "منتجات السلة للخضار والفواكه",
  tagline: "خضار طازجة كل يوم",
  taglineEn: "Fresh vegetables every day",
  nameEn: "منتجات السلة للخضار والفواكه",
  phone: "0530707042",
  whatsapp: "966530707042",
  location: "تبوك - حي الروضة",
  locationEn: "Tabuk - Al-Rawdah District",
  instagram: "@rwabi-almndi",
  dhabihaPhone: "0531555268",
  dhabihaWhatsapp: "966531555268",
};

export const FOOD_IMAGES: Record<string, any> = {
  chicken_full: require("@/assets/images/chicken_full.png"),
  chicken_half: require("@/assets/images/chicken_half.png"),
  chicken_mandi: require("@/assets/images/chicken_mandi.png"),
  meat_full: require("@/assets/images/meat_full.png"),
  meat_nefs: require("@/assets/images/meat_nefs.png"),
  meat_half: require("@/assets/images/meat_half.png"),
  meat_mandi: require("@/assets/images/meat_mandi.png"),
  oreo_dessert: require("@/assets/images/oreo_dessert.jpg"),
  tatli: require("@/assets/images/tatli.jpg"),
  muhalabia: require("@/assets/images/muhalabia.jpg"),
  kunafa: require("@/assets/images/kunafa.png"),
  pepsi: require("@/assets/images/pepsi.jpg"),
  delivery_car: require("@/assets/images/delivery_car.jpg"),
  dhabiha: require("@/assets/images/dhabiha.png"),
  ramadan: require("@/assets/images/ramadan.png"),
  eid_fitr: require("@/assets/images/eid_fitr.png"),
  eid_adha: require("@/assets/images/eid_adha.png"),
  national_day: require("@/assets/images/national_day.png"),
  occasions: require("@/assets/images/occasions.png"),
  rice: require("@/assets/images/rice.jpg"),
  rice_mandi: require("@/assets/images/rice_mandi.jpg"),
  maqbous_chicken: require("@/assets/images/maqbous_chicken.jpg"),
  maqbous_half: require("@/assets/images/maqbous_half.jpg"),
  molokhia: require("@/assets/images/molokhia.jpg"),
  qursan: require("@/assets/images/qursan.jpg"),
  mdfoon_chicken: require("@/assets/images/mdfoon_chicken.jpg"),
  dew: require("@/assets/images/dew.jpg"),
  mirinda_orange: require("@/assets/images/mirinda_orange.jpg"),
  sevenup: require("@/assets/images/sevenup.jpg"),
  pepsi_family: require("@/assets/images/pepsi_family.jpg"),
  mirinda_citrus: require("@/assets/images/mirinda_citrus.jpg"),
  laban: require("@/assets/images/laban.jpg"),
  pepsi_diet_can: require("@/assets/images/pepsi_diet_can.jpg"),
  sevenup_can: require("@/assets/images/sevenup_can.jpg"),
  mirinda_citrus_can: require("@/assets/images/mirinda_citrus_can.jpg"),
  pepsi_can: require("@/assets/images/pepsi_can.jpg"),
  laban_qariah_lg: require("@/assets/images/laban_qariah_lg.jpg"),
  laban_qariah_sm: require("@/assets/images/laban_qariah_sm.jpg"),
  laban_almarai_lg: require("@/assets/images/laban_almarai_lg.jpg"),
  laban_almarai_1l: require("@/assets/images/laban_almarai_1l.jpg"),
  goat_mandi: require("@/assets/images/goat_mandi.jpg"),
  bamya: require("@/assets/images/bamya.jpg"),
  masqaa: require("@/assets/images/masqaa.jpg"),
  salad_laban: require("@/assets/images/salad_laban.jpg"),
  salad_green: require("@/assets/images/salad_green.jpg"),
  tahini: require("@/assets/images/tahini.jpg"),
  chicken_grill: require("@/assets/images/chicken_grill.jpg"),
  chicken_mandi_new: require("@/assets/images/chicken_mandi_new.jpg"),
  meat_mandi_nfar: require("@/assets/images/meat_mandi_nfar.jpg"),
  jareesh: require("@/assets/images/jareesh.jpg"),
};

const CHICKEN_AND_MAINS_ITEMS: MenuItem[] = [
  { id: "c1",  name: "مندي دجاج حبة كاملة مع الرز",    nameEn: "Whole Chicken Mandi with Rice",     price: 44, category: "chicken", imageKey: "chicken_mandi_new" },
  { id: "c2",  name: "مندي دجاج نص حبة مع الرز",       nameEn: "Half Chicken Mandi with Rice",      price: 22, category: "chicken", imageKey: "chicken_mandi_new" },
  { id: "ma1", name: "مضغوط دجاج حبة كاملة مع الرز",   nameEn: "Whole Chicken Maqbous with Rice",   price: 44, category: "chicken", imageKey: "maqbous_chicken"   },
  { id: "ma2", name: "مضغوط دجاج نص حبة مع الرز",      nameEn: "Half Chicken Maqbous with Rice",    price: 22, category: "chicken", imageKey: "maqbous_half"      },
  { id: "ma3", name: "دجاج مدفون حبة كاملة مع الرز",   nameEn: "Whole Buried Chicken with Rice",    price: 44, category: "chicken", imageKey: "mdfoon_chicken"    },
  { id: "ma4", name: "دجاج مدفون نص حبة مع الرز",      nameEn: "Half Buried Chicken with Rice",     price: 22, category: "chicken", imageKey: "mdfoon_chicken"    },
  { id: "c5",  name: "نص حبة على الفحم مع الرز",        nameEn: "Half Grilled Chicken with Rice",    price: 22, category: "chicken", imageKey: "chicken_grill"     },
  { id: "c6",  name: "حبة على الفحم مع الرز",           nameEn: "Whole Grilled Chicken with Rice",   price: 44, category: "chicken", imageKey: "chicken_grill"     },
  { id: "c7",  name: "نص حبة على الفحم سادة",           nameEn: "Half Grilled Chicken Plain",        price: 15, category: "chicken", description: "بدون رز", descriptionEn: "Without Rice", imageKey: "chicken_grill" },
  { id: "c8",  name: "حبة على الفحم سادة",              nameEn: "Whole Grilled Chicken Plain",       price: 30, category: "chicken", description: "بدون رز", descriptionEn: "Without Rice", imageKey: "chicken_grill" },
  { id: "c3",  name: "رز مندي",                         nameEn: "Mandi Rice",                        price: 7,  category: "chicken", imageKey: "rice_mandi"        },
  { id: "c4",  name: "رز بشاور",                        nameEn: "Peshawar Rice",                     price: 7,  category: "chicken", imageKey: "rice"              },
];

export const MENU_CATEGORIES: MenuCategory[] = [
  {
    id: "chicken",
    name: "الدجاج",
    nameEn: "Chicken",
    icon: "🍗",
    items: CHICKEN_AND_MAINS_ITEMS,
  },
  {
    id: "meat",
    name: "اللحوم",
    nameEn: "Meat",
    icon: "🥩",
    items: [
      { id: "m1", name: "لحم مندي بلدي - تيس كامل", nameEn: "Local Lamb Mandi - Whole Goat",    price: 1400, category: "meat", imageKey: "goat_mandi" },
      { id: "m2", name: "لحم مندي بلدي - نص تيس",   nameEn: "Local Lamb Mandi - Half Goat",     price: 700,  category: "meat", imageKey: "goat_mandi" },
      { id: "m3", name: "لحم مندي بلدي - ربع تيس",  nameEn: "Local Lamb Mandi - Quarter Goat",  price: 350,  category: "meat", imageKey: "goat_mandi" },
      { id: "m4", name: "لحم مندي - نفر",            nameEn: "Lamb Mandi - Per Person",          price: 90,   category: "meat", imageKey: "meat_mandi_nfar" },
      { id: "h1", name: "حنيذ بلدي - كامل",          nameEn: "Local Haneeth - Whole",            price: 1400, category: "meat", imageKey: "goat_mandi" },
      { id: "h2", name: "حنيذ بلدي - نفر",           nameEn: "Local Haneeth - Per Person",       price: 90,   category: "meat", imageKey: "meat_mandi_nfar" },
    ],
  },
  {
    id: "sides",
    name: "الإيدامات",
    nameEn: "Sides",
    icon: "🥘",
    items: [
      { id: "s1",  name: "إيدام ملوخية صغير",  nameEn: "Mulukhiyah Stew Small",  price: 4, category: "sides", imageKey: "molokhia" },
      { id: "s2",  name: "إيدام ملوخية كبير",  nameEn: "Mulukhiyah Stew Large",  price: 6, category: "sides", imageKey: "molokhia" },
      { id: "e6",  name: "إيدام مصقعة صغير",   nameEn: "Masoqa Stew Small",      price: 4, category: "sides", imageKey: "masqaa"   },
      { id: "e7",  name: "إيدام مصقعة كبير",   nameEn: "Masoqa Stew Large",      price: 6, category: "sides", imageKey: "masqaa"   },
      { id: "e4",  name: "باميه صغير",          nameEn: "Okra Small",             price: 5, category: "sides", imageKey: "bamya"    },
      { id: "e5",  name: "باميه كبير",           nameEn: "Okra Large",             price: 7, category: "sides", imageKey: "bamya"    },
      { id: "s5",  name: "إيدام فرن كبير",      nameEn: "Oven Stew Large",        price: 6, category: "sides"                       },
    ],
  },
  {
    id: "salads",
    name: "السلطات",
    nameEn: "Salads",
    icon: "🥗",
    items: [
      { id: "sa1", name: "سلطة خيار باللبن", nameEn: "Cucumber Yogurt Salad", price: 3, category: "salads", imageKey: "salad_laban" },
      { id: "sa2", name: "سلطة خضراء",       nameEn: "Green Salad",           price: 3, category: "salads", imageKey: "salad_green" },
      { id: "sa3", name: "طحينة سائلة",      nameEn: "Tahini Sauce",          price: 3, category: "salads", imageKey: "tahini"      },
    ],
  },
  {
    id: "desserts",
    name: "الحلويات",
    nameEn: "Desserts",
    icon: "🍮",
    items: [
      { id: "d1", name: "حلا أوريو",    nameEn: "Oreo Dessert",    price: 4, category: "desserts", imageKey: "oreo_dessert" },
      { id: "d2", name: "حلا تطلي",    nameEn: "Tatli Dessert",   price: 4, category: "desserts", imageKey: "tatli"        },
      { id: "d3", name: "حلا مهلبية",  nameEn: "Muhalabia",       price: 4, category: "desserts", imageKey: "muhalabia"    },
      { id: "d4", name: "كنافة قشطة",  nameEn: "Kunafa with Cream", price: 8, category: "desserts", imageKey: "kunafa"    },
    ],
  },
  {
    id: "drinks",
    name: "المشروبات",
    nameEn: "Drinks",
    icon: "🥤",
    items: [
      { id: "dr1",  name: "بيبسي عائلي 2.25 لتر",    nameEn: "Pepsi Family 2.25L",        price: 9,   category: "drinks", imageKey: "pepsi_family"       },
      { id: "dr2",  name: "بيبسي وسط 1 لتر",          nameEn: "Pepsi Medium 1L",           price: 5,   category: "drinks", imageKey: "pepsi"              },
      { id: "dr3",  name: "بيبسي علبة",               nameEn: "Pepsi Can",                 price: 2.5, category: "drinks", imageKey: "pepsi_can"          },
      { id: "dr9",  name: "بيبسي دايت علبة",          nameEn: "Pepsi Diet Can",            price: 2.5, category: "drinks", imageKey: "pepsi_diet_can"     },
      { id: "dr5",  name: "ديو عائلي",                nameEn: "Mountain Dew Family",       price: 9,   category: "drinks", imageKey: "dew"                },
      { id: "dr6",  name: "ميرندا برتقال عائلي",      nameEn: "Mirinda Orange Family",     price: 9,   category: "drinks", imageKey: "mirinda_orange"     },
      { id: "dr7",  name: "ميرندا حمضيات عائلي",      nameEn: "Mirinda Citrus Family",     price: 9,   category: "drinks", imageKey: "mirinda_citrus"     },
      { id: "dr11", name: "ميرندا حمضيات علبة",       nameEn: "Mirinda Citrus Can",        price: 2.5, category: "drinks", imageKey: "mirinda_citrus_can" },
      { id: "dr8",  name: "سفن أب عائلي",             nameEn: "7UP Family",                price: 9,   category: "drinks", imageKey: "sevenup"            },
      { id: "dr10", name: "سفن أب فري علبة",          nameEn: "7UP Free Can",              price: 2.5, category: "drinks", imageKey: "sevenup_can"        },
      { id: "dr4",  name: "لبن المراعي علبة",          nameEn: "Almarai Laban Can",         price: 2.5, category: "drinks", imageKey: "laban"              },
      { id: "dr12", name: "لبن القرية حجم كبير",      nameEn: "Al-Qariah Laban Large",     price: 9,   category: "drinks", imageKey: "laban_qariah_lg"    },
      { id: "dr13", name: "لبن القرية حجم صغير",      nameEn: "Al-Qariah Laban Small",     price: 3,   category: "drinks", imageKey: "laban_qariah_sm"    },
      { id: "dr14", name: "لبن المراعي 2 لتر",        nameEn: "Almarai Laban 2L",          price: 11,  category: "drinks", imageKey: "laban_almarai_lg"   },
      { id: "dr15", name: "لبن المراعي 1 لتر",        nameEn: "Almarai Laban 1L",          price: 6,   category: "drinks", imageKey: "laban_almarai_1l"   },
    ],
  },
  {
    id: "extras",
    name: "إضافات",
    nameEn: "Extras",
    icon: "✨",
    items: [
      { id: "e2",  name: "قرصان صغير",        nameEn: "Qursan Small",               price: 4, category: "extras", imageKey: "qursan"      },
      { id: "e3",  name: "قرصان كبير",        nameEn: "Qursan Large",               price: 6, category: "extras", imageKey: "qursan"      },
      { id: "e11", name: "جريش صغير",         nameEn: "Jareesh Small",              price: 4, category: "extras", imageKey: "jareesh"     },
      { id: "e12", name: "جريش كبير",         nameEn: "Jareesh Large",              price: 6, category: "extras", imageKey: "jareesh"     },
      { id: "e8",  name: "سلطة خيار باللبن", nameEn: "Cucumber Yogurt Salad",      price: 3, category: "extras", imageKey: "salad_laban" },
      { id: "e9",  name: "سلطة خضراء",       nameEn: "Green Salad",                price: 3, category: "extras", imageKey: "salad_green" },
      { id: "e10", name: "طحينية سائلة",     nameEn: "Tahini Sauce",               price: 3, category: "extras", imageKey: "tahini"      },
    ],
  },
  {
    id: "occasions",
    name: "عروض المناسبات",
    nameEn: "Special Offers",
    icon: "🎉",
    isOccasions: true,
    items: [
      { id: "oc1", name: "عروض رمضان الكريم",        nameEn: "Ramadan Offers",        price: 0, category: "occasions", description: "أسعار مميزة طوال الشهر الكريم",    descriptionEn: "Special prices throughout Ramadan",      imageKey: "ramadan"      },
      { id: "oc2", name: "عروض عيد الفطر المبارك",   nameEn: "Eid Al-Fitr Offers",    price: 0, category: "occasions", description: "احتفل مع أهلك بأشهى المأكولات",   descriptionEn: "Celebrate with your family",             imageKey: "eid_fitr"     },
      { id: "oc3", name: "عروض عيد الأضحى المبارك",  nameEn: "Eid Al-Adha Offers",    price: 0, category: "occasions", description: "ذبائح وولائم العيد",               descriptionEn: "Eid sacrifices and feasts",              imageKey: "eid_adha"     },
      { id: "oc4", name: "عروض اليوم الوطني",         nameEn: "National Day Offers",   price: 0, category: "occasions", description: "احتفالاً باليوم الوطني السعودي",   descriptionEn: "Celebrating Saudi National Day",         imageKey: "national_day" },
      { id: "oc5", name: "عروض المناسبات الخاصة",    nameEn: "Special Event Offers",  price: 0, category: "occasions", description: "أعراس • مآتم • تجمعات",            descriptionEn: "Weddings • Gatherings • Events",          imageKey: "occasions"    },
    ],
  },
];

export const ALL_ITEMS: MenuItem[] = MENU_CATEGORIES.flatMap((cat) => cat.items);
