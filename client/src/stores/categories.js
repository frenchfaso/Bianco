export const categories = [
  { id: 'food_grocery', color: '#0f766e' },
  { id: 'restaurant', color: '#d97706' },
  { id: 'transport', color: '#2563eb' },
  { id: 'home', color: '#7c3aed' },
  { id: 'health', color: '#dc2626' },
  { id: 'personal', color: '#db2777' },
  { id: 'entertainment', color: '#0891b2' },
  { id: 'other', color: '#64748b' }
]

export const categoryMap = Object.fromEntries(categories.map((category) => [category.id, category]))
