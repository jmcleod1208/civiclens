import { View, Text, FlatList, TouchableOpacity } from 'react-native'
import { useQueries } from '@tanstack/react-query'
import { BookmarkCheck, Bookmark } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fetchDocument, fetchPolitician } from '../../lib/api'
import { useFollowingStore, useAuthStore } from '../../lib/store'
import { DocumentCard } from '../../components/DocumentCard'
import { useRouter } from 'expo-router'

export default function FollowingScreen() {
  const { documentIds, politicianIds } = useFollowingStore()
  const { hasAccess } = useAuthStore()
  const router = useRouter()

  const docQueries = useQueries({
    queries: documentIds.map(id => ({
      queryKey: ['document', id],
      queryFn: () => fetchDocument(id),
      staleTime: 60_000,
    })),
  })

  const polQueries = useQueries({
    queries: politicianIds.map(id => ({
      queryKey: ['politician', id],
      queryFn: () => fetchPolitician(id),
      staleTime: 60_000,
    })),
  })

  const docs = docQueries.flatMap(q => q.data ? [q.data] : [])
  const politicians = polQueries.flatMap(q => q.data ? [q.data] : [])
  const isEmpty = documentIds.length === 0 && politicianIds.length === 0

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-4 pt-3 pb-2">
        <Text className="text-2xl font-bold text-gray-900">Following</Text>
      </View>

      {isEmpty ? (
        <View className="flex-1 items-center justify-center pb-20 px-8">
          <Bookmark size={48} color="#d1d5db" />
          <Text className="text-gray-400 text-base mt-3 mb-1 text-center">Nothing followed yet</Text>
          <Text className="text-gray-300 text-sm text-center">
            Bookmark documents and politicians to track them here
          </Text>
        </View>
      ) : (
        <FlatList
          data={[
            ...(docs.length > 0 ? [{ type: 'section', label: `Bills & Documents (${docs.length})` }] : []),
            ...docs.map(d => ({ type: 'doc', doc: d })),
            ...(politicians.length > 0 ? [{ type: 'section', label: `Politicians (${politicians.length})` }] : []),
            ...politicians.map(p => ({ type: 'pol', pol: p })),
          ]}
          keyExtractor={(item: any, i) => item.doc?.id ?? item.pol?.id ?? `section-${i}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: any) => {
            if (item.type === 'section') {
              return (
                <Text className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 mt-4">
                  {item.label}
                </Text>
              )
            }
            if (item.type === 'doc') {
              return <DocumentCard doc={item.doc} hasAccess={hasAccess} />
            }
            if (item.type === 'pol') {
              const p = item.pol
              return (
                <TouchableOpacity
                  onPress={() => router.push(`/politician/${p.id}`)}
                  className="bg-white rounded-2xl p-4 mb-3 border border-gray-100 flex-row items-center gap-3 active:opacity-80"
                >
                  <View className="w-10 h-10 rounded-full bg-teal-100 items-center justify-center">
                    <Text className="text-sm font-bold text-teal-700">{p.name.charAt(0)}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-gray-900">{p.name}</Text>
                    <Text className="text-xs text-gray-400">
                      {[p.title, p.party, p.district].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <BookmarkCheck size={16} color="#01696f" />
                </TouchableOpacity>
              )
            }
            return null
          }}
        />
      )}
    </SafeAreaView>
  )
}
