import { Tabs } from 'expo-router'
import { Home, Search, BookmarkCheck, Bell, User } from 'lucide-react-native'
import { View, Text } from 'react-native'

const TEAL = '#01696f'
const GRAY = '#9ca3af'

function TabIcon({ icon: Icon, focused, label }: { icon: any; focused: boolean; label: string }) {
  return (
    <View className="items-center pt-1">
      <Icon size={22} color={focused ? TEAL : GRAY} strokeWidth={focused ? 2.5 : 1.8} />
      <Text style={{ color: focused ? TEAL : GRAY, fontSize: 10, marginTop: 2, fontWeight: focused ? '600' : '400' }}>
        {label}
      </Text>
    </View>
  )
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e4e2dc',
          height: 60,
          paddingBottom: 6,
          paddingTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon={Home} focused={focused} label="Feed" />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon={Search} focused={focused} label="Search" />,
        }}
      />
      <Tabs.Screen
        name="following"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon={BookmarkCheck} focused={focused} label="Following" />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon={Bell} focused={focused} label="Alerts" />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon={User} focused={focused} label="Account" />,
        }}
      />
    </Tabs>
  )
}
