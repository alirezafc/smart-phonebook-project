export default function SearchBar({ value, onChange, units = [], unit, onUnitChange }){
  return (
    <div className="my-6 grid gap-3 sm:grid-cols-3">
      <input
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        placeholder="جستجو کنید"
        className="w-full p-3 rounded-2xl border shadow-sm col-span-2"
      />
      <select value={unit} onChange={e=>onUnitChange(e.target.value)} className="w-full p-3 rounded-2xl border shadow-sm">
        <option value="">تمام واحدها</option>
        {units.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  )
}
