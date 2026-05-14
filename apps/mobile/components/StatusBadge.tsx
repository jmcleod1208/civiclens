import { View, Text } from 'react-native'

const STATUS: Record<string, { bg: string; text: string; label: string }> = {
  introduced:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Introduced' },
  in_committee: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'In Committee' },
  passed:       { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Passed' },
  signed:       { bg: 'bg-teal-100',   text: 'text-teal-700',   label: 'Signed' },
  failed:       { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Failed' },
  vetoed:       { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Vetoed' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: status }
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${s.bg}`}>
      <Text className={`text-xs font-medium ${s.text}`}>{s.label}</Text>
    </View>
  )
}
