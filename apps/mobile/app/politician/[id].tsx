import { View, Text, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Mail, Phone, ExternalLink, Bookmark, BookmarkCheck } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fetchPolitician } from '../../lib/api'
import { useFollowingStore, useAuthStore } from '../../lib/store'
import { StatusBadge } from '../../components/StatusBadge'

export default function PoliticianDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { politicianIds, togglePolitician } = useFollowingStore()
  const { hasAccess } = useAuthStore()
  const isFollowing = politicianIds.includes(id ?? '')

  const { data: politician, isLoading } = useQuery({
    queryKey: ['politician', id],
    queryFn: () => fetchPolitician(id!),
    enabled: !!id,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#01696f" size="large" />
      </SafeAreaView>
    )
  }

  if (!politician) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <Text className="text-gray-400">Politician not found.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1 active:opacity-60">
          <ArrowLeft size={22} color="#374151" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => togglePolitician(id!)} className="p-1 active:opacity-60">
          {isFollowing
            ? <BookmarkCheck size={22} color="#01696f" />
            : <Bookmark size={22} color="#9ca3af" />
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View className="px-4">
          {/* Profile */}
          <View className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <View className="flex-row gap-4 items-center mb-4">
              <View className="w-16 h-16 rounded-full bg-teal-100 items-center justify-center">
                <Text className="text-2xl font-bold text-teal-700">{politician.name.charAt(0)}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-gray-900 leading-tight">{politician.name}</Text>
                <Text className="text-xs text-gray-500 mt-0.5">
                  {[politician.title, politician.party, politician.district].filter(Boolean).join(' · ')}
                </Text>
                <Text className="text-xs text-gray-400 mt-0.5 capitalize">
                  {politician.level?.replace('_', ' ')} · {politician.jurisdiction}
                </Text>
              </View>
            </View>

            {/* Contact buttons */}
            <View className="flex-row flex-wrap gap-2">
              {politician.contactEmail && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`mailto:${politician.contactEmail}`)}
                  className="flex-row items-center gap-1.5 border border-gray-200 rounded-full px-4 py-2 active:bg-gray-50"
                >
                  <Mail size={13} color="#374151" />
                  <Text className="text-xs text-gray-700">Email</Text>
                </TouchableOpacity>
              )}
              {politician.contactPhone && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${politician.contactPhone}`)}
                  className="flex-row items-center gap-1.5 border border-gray-200 rounded-full px-4 py-2 active:bg-gray-50"
                >
                  <Phone size={13} color="#374151" />
                  <Text className="text-xs text-gray-700">{politician.contactPhone}</Text>
                </TouchableOpacity>
              )}
              {politician.contactFormUrl && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(politician.contactFormUrl!)}
                  className="flex-row items-center gap-1.5 border border-gray-200 rounded-full px-4 py-2 active:bg-gray-50"
                >
                  <ExternalLink size={13} color="#374151" />
                  <Text className="text-xs text-gray-700">Contact form</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Document history */}
          <Text className="text-base font-bold text-gray-900 mb-3">Document History</Text>
          {politician.documents && politician.documents.length > 0 ? (
            politician.documents.map(({ document: doc, role }) => (
              <TouchableOpacity
                key={doc.id}
                onPress={() => router.push(`/document/${doc.id}`)}
                className="bg-white rounded-2xl border border-gray-100 p-4 mb-3 active:opacity-80"
              >
                <View className="flex-row items-center gap-2 flex-wrap mb-2">
                  <StatusBadge status={doc.status} />
                  <Text className="text-xs text-gray-400 capitalize">{role.replace('_', ' ')}</Text>
                </View>
                <Text className="text-sm font-medium text-gray-900 leading-snug" numberOfLines={2}>
                  {doc.title}
                </Text>
                {doc.introducedDate && (
                  <Text className="text-xs text-gray-400 mt-1">
                    {new Date(doc.introducedDate).toLocaleDateString()}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          ) : (
            <Text className="text-sm text-gray-400 italic">No documents linked yet.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
