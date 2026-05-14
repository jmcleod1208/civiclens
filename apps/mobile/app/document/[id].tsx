import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Linking, ActivityIndicator
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, ExternalLink, Lightbulb, FileText, Users, Globe,
  Bookmark, BookmarkCheck
} from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fetchDocument } from '../../lib/api'
import { useAuthStore, useFollowingStore } from '../../lib/store'
import { StatusBadge } from '../../components/StatusBadge'
import { PaywallSheet } from '../../components/PaywallSheet'

type Tab = 'plain' | 'full' | 'politicians'

const TABS: { id: Tab; label: string; Icon: any }[] = [
  { id: 'plain',      label: 'Plain English', Icon: Lightbulb },
  { id: 'full',       label: 'Full Document', Icon: FileText },
  { id: 'politicians', label: 'Politicians',  Icon: Users },
]

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { hasAccess, user } = useAuthStore()
  const { documentIds, toggleDocument } = useFollowingStore()
  const [tab, setTab] = useState<Tab>('plain')
  const [showPaywall, setShowPaywall] = useState(false)
  const isBookmarked = documentIds.includes(id ?? '')

  const { data: doc, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => fetchDocument(id!),
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

  if (!doc) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <Text className="text-gray-400">Document not found.</Text>
      </SafeAreaView>
    )
  }

  const summary = doc.summary

  function handlePlainEnglishTab() {
    if (!hasAccess) {
      setShowPaywall(true)
    } else {
      setTab('plain')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Navigation header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1 active:opacity-60">
          <ArrowLeft size={22} color="#374151" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => toggleDocument(id!)} className="p-1 active:opacity-60">
          {isBookmarked
            ? <BookmarkCheck size={22} color="#01696f" />
            : <Bookmark size={22} color="#9ca3af" />
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View className="px-4">
          {/* Meta */}
          <View className="flex-row items-center gap-2 flex-wrap mb-2">
            <StatusBadge status={doc.status} />
            <Text className="text-xs text-gray-400 capitalize">
              {doc.level?.replace('_', ' ')} · {doc.jurisdiction}
            </Text>
          </View>

          {/* Title */}
          <Text className="text-xl font-bold text-gray-900 leading-snug mb-3">
            {doc.title}
          </Text>

          {/* Topics */}
          {doc.topics.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              {doc.topics.map(t => (
                <View key={t} className="mr-2 rounded-full bg-teal-50 px-3 py-1">
                  <Text className="text-xs text-teal-700">{t}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Tabs */}
          <View className="flex-row border-b border-gray-100 mb-5">
            {TABS.map(({ id: tid, label, Icon }) => {
              const active = tab === tid
              const isPaywalled = tid === 'plain' && !hasAccess
              return (
                <TouchableOpacity
                  key={tid}
                  onPress={() => tid === 'plain' ? handlePlainEnglishTab() : setTab(tid)}
                  className="flex-row items-center gap-1.5 mr-4 pb-3"
                  style={{ borderBottomWidth: active ? 2 : 0, borderBottomColor: '#01696f' }}
                >
                  <Icon size={14} color={active ? '#01696f' : '#9ca3af'} />
                  <Text className={`text-sm font-medium ${active ? 'text-teal-600' : 'text-gray-400'}`}>
                    {label}
                  </Text>
                  {isPaywalled && (
                    <Text className="text-xs">🔒</Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Plain English */}
          {tab === 'plain' && (
            <View>
              {hasAccess && summary ? (
                [
                  { key: 'what_it_proposes',     label: 'What it proposes' },
                  { key: 'who_it_affects',        label: 'Who it affects' },
                  { key: 'what_it_means_for_you', label: 'What it means for you' },
                ].map(({ key, label }) =>
                  (summary as any)[key] ? (
                    <View key={key} className="mb-5">
                      <Text className="text-xs font-semibold uppercase tracking-wider text-teal-600 mb-1.5">
                        {label}
                      </Text>
                      <Text className="text-sm text-gray-700 leading-relaxed">
                        {(summary as any)[key]}
                      </Text>
                    </View>
                  ) : null
                )
              ) : hasAccess ? (
                <Text className="text-sm text-gray-400 italic">
                  Summary not yet available — check back shortly.
                </Text>
              ) : null}
            </View>
          )}

          {/* Full Document */}
          {tab === 'full' && (
            <View>
              {doc.fullText ? (
                <Text className="text-xs text-gray-600 leading-relaxed">{doc.fullText}</Text>
              ) : (
                <View className="items-center py-10">
                  <Text className="text-gray-400 text-sm mb-4">Full text not yet extracted.</Text>
                  {doc.sourceUrl && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(doc.sourceUrl!)}
                      className="flex-row items-center gap-2 bg-teal-50 rounded-xl px-4 py-2.5 active:bg-teal-100"
                    >
                      <Text className="text-teal-600 text-sm font-medium">View source</Text>
                      <ExternalLink size={14} color="#01696f" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Politicians */}
          {tab === 'politicians' && (
            <View>
              {doc.politicians && doc.politicians.length > 0 ? (
                doc.politicians.map(({ politician: p, role }) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => router.push(`/politician/${p.id}`)}
                    className="flex-row items-center gap-3 bg-white rounded-2xl p-3.5 mb-3 border border-gray-100 active:opacity-80"
                  >
                    <View className="w-10 h-10 rounded-full bg-teal-100 items-center justify-center">
                      <Text className="text-sm font-bold text-teal-700">{p.name.charAt(0)}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-gray-900">{p.name}</Text>
                      <Text className="text-xs text-gray-400">
                        {p.title ?? ''}{p.party ? ` · ${p.party}` : ''}
                      </Text>
                    </View>
                    <Text className="text-xs text-gray-400 capitalize">{role.replace('_', ' ')}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text className="text-sm text-gray-400 italic">No politicians linked.</Text>
              )}
            </View>
          )}

          {/* Details sidebar (always visible at bottom) */}
          <View className="mt-6 bg-white rounded-2xl border border-gray-100 p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Details</Text>
            {[
              ['Type',         doc.type?.replace('_', ' ')],
              ['Introduced',   doc.introducedDate ? new Date(doc.introducedDate).toLocaleDateString() : null],
              ['Last action',  doc.lastActionDate  ? new Date(doc.lastActionDate).toLocaleDateString()  : null],
            ].filter(([, v]) => v).map(([label, value]) => (
              <View key={label as string} className="flex-row justify-between py-1.5 border-b border-gray-50">
                <Text className="text-xs text-gray-400">{label}</Text>
                <Text className="text-xs font-medium text-gray-700 capitalize">{value}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchased={() => { setShowPaywall(false); setTab('plain') }}
      />
    </SafeAreaView>
  )
}
