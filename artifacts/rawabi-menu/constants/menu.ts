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
  tagline: "خضار وفواكه طازجة كل يوم",
  taglineEn: "Fresh vegetables and fruits every day",
  nameEn: "Basket Vegetables and Fruits",
  phone: "0596548325",
  whatsapp: "966596548325",
  location: "تبوك - حي الصفا",
  locationEn: "Tabuk - Al Safa District",
  instagram: "",
  dhabihaPhone: "",
  dhabihaWhatsapp: "",
};

// Products, categories, and product images are server-owned. These exports stay
// empty so deleted legacy restaurant content can never be bundled or used as an
// offline fallback.
export const FOOD_IMAGES: Record<string, never> = {};
export const MENU_CATEGORIES: MenuCategory[] = [];
export const ALL_ITEMS: MenuItem[] = [];