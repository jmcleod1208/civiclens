import { useState } from 'react'
import {
  View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Search as SearchIcon, X } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { search as apiSearch } from '../../lib/api'
import { useAuthStore } from '../../lib/store'
import { DocumentCard } from '../../components/DocumentCard'
import { SkeletonList } from '../../components/SkeletonCard'

export default function SearchScreen() {
  const { hasAccess } = useAuthStore()
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['search', submitted],
    queryFn: () => apiSearch(submitted, { limit: 20 }),
    enabled: submitted.length >= 2,
    staleTime: 30_000,
  })

  function handleSubmit() {
    setSubmitted(q.trim())
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-4 pt-3 pb-3">
        <Text className="text-2xl font-bold text-gray-900 mb-3">Search</Text>
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center bg-white border border-gray-200 rounded-xl px-3 h-11">
            <SearchIcon size={16} color="#9ca3af" />
            <TextInput
              className="flex-1 ml-2 text-sm text-gray-900"
              placeholder="Bills, resolutions, agendas..."
              placeholderTextColor="#9ca3af"
              value={q}
              onChangeText={setQ}
              onSubmitEditing={handleSubmit}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {q.length > 0 && (
              <TouchableOpacity onPress={() => { setQ(''); setSubmitted('') }}>
                <X size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={handleSubmit}
            className="bg-teal-500 h-11 px-4 rounded-xl items-center justify-center active:bg-teal-600"
          >
            <Text className="text-white text-sm font-medium">Go</Text>
          </TouchableOpacity>
        </View>
      </View>

      {submitted.length < 2 && (
        <View className="flex-1 items-center justify-center pb-20">
          <SearchIcon size={48} color="#d1d5db" />
          <Text className="text-gray-400 text-base mt-3">Type to search documents</Text>
        </View>
      )}

      {isLoading && submitted.length >= 2 && (
        <View className="px-4"><SkeletonList count={3} /></View>
      )}

      {data && (
        <FlatList
          data={data.data}
          keyExtractor={d => d.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text className="text-xs text-gray-400 mb-3">
              {data.total.toLocaleString()} results for "{submitted}"
            </Text>
          }
          renderItem={({ item }) => <DocumentCard doc={item} hasAccess={hasAccess} />}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-gray-400 text-base">No results for "{submitted}"</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
