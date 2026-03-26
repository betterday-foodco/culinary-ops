const fs = require('fs');
const text = fs.readFileSync('D:\\NEW Culinary App Database - wc-product-export-26-2-2026-1772144598463.csv', 'utf-8');
const lines = text.split('\n');
const vegLines = lines.filter(l => l.includes('MEAL-') && !l.includes('> Meat') && !l.includes('Marketplace'));
const catSet = new Set();
vegLines.forEach(l => {
  // Quick split (not proper CSV but enough to see categories)
  const parts = l.split(',');
  const sku = (parts[2] || '').trim().replace(/"/g,'');
  // Find the categories column — it's around column 27 but may shift with commas in fields
  // Let's just grab everything between the last unique markers
  const catMatch = l.match(/MEAL-\d+[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,([^,]+)/);
  if (sku) catSet.add(l.match(/"[^"]*Meals[^"]*"/)?.[0] || 'no-category-found');
});
const unique = [...catSet];
console.log('Unique categories for non-Meat MEAL-* products:');
unique.slice(0, 20).forEach(c => console.log(' ', c));
console.log('\nTotal non-Meat MEAL-* rows:', vegLines.length);
