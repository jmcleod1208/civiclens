import { useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl
} from 'react-native'
import { useInfiniteQuery } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fetchDocuments } from '../../lib/api'
import { useAuthStore } from '../../lib/store'
import { DocumentCard } from '../../components/DocumentCard'
import { SkeletonList } from '../../components/SkeletonCard'

const PAGE_SIZE = 15
const LEVELS = ['federal', 'state', 'county', 'city', 'school_board']

export default function FeedScreen() {
  const { hasAccess } = useAuthStore()
  const [level, setLevel] = useState('')
  const [showFilter, setShowFilter] = useState(false)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } =
    useInfiniteQuery({
      queryKey: ['documents', level],
      queryFn: ({ pageParam = 0 }) =>
        fetchDocuments({ limit: PAGE_SIZE, offset: pageParam, ...(level ? { level } : {}) }),
      getNextPageParam: (last, all) => {
        const fetched = all.flatMap(p => p.data).length
        return fetched < last.total ? fetched : undefined
      },
      initialPageParam: 0,
      staleTime: 60_000,
    })

  const docs = data?.pages.flatMap(p => p.data) ?? []

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-2xl font-bold text-gray-900" style={{ fontFamily: undefined }}>
          CivicLens
        </Text>
        <TouchableOpacity
          onPress={() => setShowFilter(s => !s)}
          className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${showFilter || level ? 'bg-teal-500 border-teal-500' : 'border-gray-200'}`}
        >
          <SlidersHorizontal size={14} color={showFilter || level ? 'white' : '#6b7280'} />
          <Text className={`text-xs font-medium ${showFilter || level ? 'text-white' : 'text-gray-500'}`}>Filter</Text>
        </TouchableOpacity>
      </View>

      {/* Level filter chips */}
      {showFilter && (
        <View className="px-4 pb-3">
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={['', ...LEVELS]}
            keyExtractor={item => item || 'all'}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setLevel(item)}
                className={`mr-2 px-3 py-1.5 rounded-full border ${level === item ? 'bg-teal-500 border-teal-500' : 'bg-white border-gray-200'}`}
              >
                <Text className={`text-xs font-medium ${level === item ? 'text-white' : 'text-gray-600'}`}>
                  {item ? item.replace('_', ' ') : 'All'}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View className="px-4"><SkeletonList count={4} /></View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={d => d.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#01696f" />
          }
          renderItem={({ item }) => <DocumentCard doc={item} hasAccess={hasAccess} />}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color="#01696f" className="my-4" /> : null}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Text className="text-gray-400 text-base mb-1">No documents yet</Text>
              <Text className="text-gray-300 text-sm text-center px-8">
                Run the scrapers to populate your feed
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
