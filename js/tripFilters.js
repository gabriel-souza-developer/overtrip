// Categoria é texto livre cadastrado no painel; não divide rótulos por vírgula.
const normalizeFilterText = (value) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR").trim().replace(/\s+/g, " ");

const categoryOptions = (categories) => {
  const unique = new Map();
  categories.forEach((category) => {
    const label = String(category ?? "").trim().replace(/\s+/g, " ");
    const key = normalizeFilterText(label);
    if (key && !unique.has(key)) unique.set(key, label);
  });
  return Array.from(unique, ([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
};

const matchesTripFilters = ({ month, category, text }, { activeMonth, activeCategory, search }) =>
  (activeMonth === "all" || month === activeMonth) &&
  (!activeCategory || normalizeFilterText(category) === activeCategory) &&
  (!search || normalizeFilterText(text).includes(normalizeFilterText(search)));

export { categoryOptions, matchesTripFilters, normalizeFilterText };
