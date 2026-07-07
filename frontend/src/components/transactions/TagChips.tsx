/** Small rounded tag chips rendered under the category cell and in mobile cards. */
export default function TagChips({ tags }: Readonly<{ tags: string[] }>) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}
