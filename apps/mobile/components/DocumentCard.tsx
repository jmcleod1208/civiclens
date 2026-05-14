import { View, Text, TouchableOpacity, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { MapPin, ChevronRight } from 'lucide-react-native'
import { StatusBadge } from './StatusBadge'
import type { CivicDocument } from '@civiclens/shared'

const LEVEL_LABELS: Record<string, string> = {
  federal: 'Federal', state: 'State', county: 'County',
  city: 'City', school_board: 'School Board', special_district: 'Special District',
}

interface Props {
  doc: CivicDocument
  hasAccess: boolean
}

export function DocumentCard({ doc, hasAccess }: Props) {
  const router = useRouter()
  const summary = doc.summary

  return (
    <TouchableOpacity
      onPress={() => router.push(`/document/${doc.id}`)}
      className="bg-white rounded-2xl p-4 mb-3 border border-gray-100 active:opacity-80"
    >
      {/* Meta row */}
      <View className="flex-row items-center gap-2 mb-2 flex-wrap">
        <StatusBadge status={doc.status} />
        <View className="flex-row items-center gap-1">
          <MapPin size={11} color="#9ca3af" />
          <Text className="text-xs text-gray-400">
            {LEVEL_LABELS[doc.level] ?? doc.level} · {doc.jurisdiction}
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text className="text-sm font-semibold text-gray-900 leading-snug mb-2" numberOfLines={2}>
        {doc.title}
      </Text>

      {/* Topics */}
      {doc.topics.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mb-2">
          {doc.topics.slice(0, 3).map(t => (
            <View key={t} className="rounded-full bg-teal-50 px-2.5 py-0.5">
              <Text className="text-xs text-teal-700">{t}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Plain English preview */}
      {hasAccess && summary?.what_it_proposes ? (
        <Text className="text-xs text-gray-500 leading-relaxed mb-2" numberOfLines={2}>
          {summary.what_it_proposes}
        </Text>
      ) : !hasAccess ? (
        <View className="rounded-xl bg-gray-50 px-3 py-2 mb-2">
          <Text className="text-xs text-gray-400 italic">
            🔒 Subscribe to unlock Plain English summary
          </Text>
        </View>
      ) : null}

      {/* Footer */}
      <View className="flex-row items-center justify-between mt-1 pt-2 border-t border-gray-50">
        {/* Politician avatars */}
        {doc.politicians && doc.politicians.length > 0 ? (
          <View className="flex-row items-center">
            {doc.politicians.slice(0, 3).map(({ politician: p }, i) => (
              <View
                key={p.id}
                style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }}
                className="w-6 h-6 rounded-full bg-teal-100 items-center justify-center border-2 border-white overflow-hidden"
              >
                {p.photoUrl ? (
                  <Image source={{ uri: p.photoUrl }} className="w-full h-full" />
                ) : (
                  <Text className="text-xs font-bold text-teal-700">{p.name.charAt(0)}</Text>
                )}
              </View>
            ))}
            {doc.politicians.length > 3 && (
              <Text className="text-xs text-gray-400 ml-1.5">+{doc.politicians.length - 3}</Text>
            )}
          </View>
        ) : <View />}
        <ChevronRight size={16} color="#01696f" />
      </View>
    </TouchableOpacity>
  )
}
