const SkeletonBar = ({ className = '' }: { className?: string }) => (
  <div className={`bg-neutral-700 rounded animate-pulse ${className}`} />
)

export const AccountListSkeleton = () => {
  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
      {/* Header skeleton */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-3">
          <SkeletonBar className="h-5 w-28" />
        </div>
        <SkeletonBar className="h-5 w-5" />
      </div>

      {/* Quota bars skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div className="flex justify-between items-center mb-1">
              <SkeletonBar className="h-3 w-24" />
              <SkeletonBar className="h-3 w-12" />
            </div>
            <div className="h-2 bg-neutral-900 rounded-full overflow-hidden">
              <SkeletonBar className="h-full w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
