import { View, Animated, useAnimatedValue, useEffect } from 'react-native'
import { useEffect as useEff, useRef } from 'react'
import { Animated as RNAnimated } from 'react-native'

export function SkeletonCard() {
  const opacity = useRef(new RNAnimated.Value(0.4)).current

  useEff(() => {
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        RNAnimated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [opacity])

  return (
    <RNAnimated.View style={{ opacity }} className="bg-white rounded-2xl p-4 mb-3 border border-gray-100">
      <View className="flex-row items-center gap-2 mb-3">
        <View className="h-5 w-16 rounded-full bg-gray-200" />
        <View className="h-5 w-24 rounded-full bg-gray-200" />
      </View>
      <View className="h-4 w-3/4 rounded bg-gray-200 mb-2" />
      <View className="h-4 w-full rounded bg-gray-100 mb-1" />
      <View className="h-4 w-5/6 rounded bg-gray-100 mb-3" />
      <View className="flex-row gap-2">
        {[1, 2].map(i => (
          <View key={i} className="h-6 w-16 rounded-full bg-gray-100" />
        ))}
      </View>
    </RNAnimated.View>
  )
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  )
}
