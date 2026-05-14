import { View, Text, FlatList, TouchableOpacity } from 'react-native'
import { Bell, FileText, RefreshCw, Calendar } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../../lib/store'

// Placeholder alerts — replace with real API call once /api/notifications is wired up
const MOCK_ALERTS = [
  {
    id: '1',
    type: 'new_document' as const,
    title: 'New bill introduced: HB 1234',
    jurisdiction: 'Federal',
    time: '2 hours ago',
    read: false,
    documentId: null,
  },
  {
    id: '2',
    type: 'status_change' as const,
    title: 'SB 567 passed the Senate',
    jurisdiction: 'Utah',
    time: '1 day ago',
    read: false,
    documentId: null,
  },
  {
    id: '3',
    type: 'upcoming_meeting' as const,
    title: 'Davis School District board meeting tomorrow',
    jurisdiction: 'School Board',
    time: '2 days ago',
    read: true,
    documentId: null,
  },
]

const ICON_MAP = {
  new_document:    FileText,
  status_change:   RefreshCw,
  upcoming_meeting: Calendar,
}

const COLOR_MAP = {
  new_document:    '#01696f',
  status_change:   '#d97706',
  upcoming_meeting: '#3b82f6',
}

export default function AlertsScreen() {
  const { user } = useAuthStore()
  const router = useRouter()

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-8" edges={['top']}>
        <Bell size={48} color="#d1d5db" />
        <Text className="text-gray-400 text-base mt-3 mb-1 text-center">Sign in for alerts</Text>
        <TouchableOpacity
          onPress={() => router.push('/onboarding')}
          className="mt-4 bg-teal-500 rounded-full px-6 py-2.5 active:bg-teal-600"
        >
          <Text className="text-white font-semibold text-sm">Sign in</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-4 pt-3 pb-2 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-gray-900">Alerts</Text>
        {MOCK_ALERTS.some(a => !a.read) && (
          <View className="bg-teal-500 rounded-full px-2 py-0.5">
            <Text className="text-white text-xs font-medium">
              {MOCK_ALERTS.filter(a => !a.read).length} new
            </Text>
          </View>
        )}
      </View>

      <FlatList
        data={MOCK_ALERTS}
        keyExtractor={a => a.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const Icon = ICON_MAP[item.type]
          const color = COLOR_MAP[item.type]
          return (
            <TouchableOpacity
              className={`flex-row gap-3 p-4 rounded-2xl mb-3 border ${item.read ? 'bg-white border-gray-100' : 'bg-teal-50 border-teal-100'} active:opacity-80`}
              onPress={() => { if (item.documentId) router.push(`/document/${item.documentId}`) }}
            >
              <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: color + '20' }}>
                <Icon size={18} color={color} />
              </View>
              <View className="flex-1">
                <Text className={`text-sm leading-snug mb-0.5 ${item.read ? 'text-gray-700 font-normal' : 'text-gray-900 font-medium'}`}>
                  {item.title}
                </Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-gray-400">{item.jurisdiction}</Text>
                  <Text className="text-xs text-gray-300">·</Text>
                  <Text className="text-xs text-gray-400">{item.time}</Text>
                </View>
              </View>
              {!item.read && (
                <View className="w-2 h-2 rounded-full bg-teal-500 self-start mt-1.5" />
              )}
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          <View className="items-center py-20">
            <Bell size={48} color="#d1d5db" />
            <Text className="text-gray-400 text-base mt-3">No alerts yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}
