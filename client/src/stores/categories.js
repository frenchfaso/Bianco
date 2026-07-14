export const categories = [
  { id: 'food_grocery', label: 'Spesa alimentare', color: '#0f766e' },
  { id: 'restaurant', label: 'Ristorazione', color: '#d97706' },
  { id: 'transport', label: 'Trasporti', color: '#2563eb' },
  { id: 'home', label: 'Casa', color: '#7c3aed' },
  { id: 'health', label: 'Salute', color: '#dc2626' },
  { id: 'personal', label: 'Persona', color: '#db2777' },
  { id: 'entertainment', label: 'Tempo libero', color: '#0891b2' },
  { id: 'other', label: 'Altro', color: '#64748b' }
]

export const categoryMap = Object.fromEntries(categories.map((category) => [category.id, category]))

export function categoryLabel(id) {
  return categoryMap[id]?.label || id || 'Altro'
}
