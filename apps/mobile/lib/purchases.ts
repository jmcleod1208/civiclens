import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
} from 'react-native-purchases'
import { Platform } from 'react-native'

const REVENUECAT_API_KEY_IOS     = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? ''
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? ''
const ENTITLEMENT_ID = 'civic_premium'

export async function initializePurchases(userId?: string) {
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG)
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID
    if (!apiKey) return
    await Purchases.configure({ apiKey, appUserID: userId })
  } catch (e) {
    console.warn('[purchases] configure failed:', e)
  }
}

export async function checkEntitlement(): Promise<boolean> {
  try {
    const info: CustomerInfo = await Purchases.getCustomerInfo()
    const entitlement = info.entitlements.active[ENTITLEMENT_ID]
    return !!entitlement
  } catch {
    return false
  }
}

export async function presentPaywall(): Promise<{
  purchased: boolean
  customerInfo: CustomerInfo | null
}> {
  try {
    const offerings = await Purchases.getOfferings()
    const current = offerings.current
    if (!current) return { purchased: false, customerInfo: null }

    // Get the first available package (monthly)
    const pkg = current.monthly ?? current.availablePackages[0]
    if (!pkg) return { purchased: false, customerInfo: null }

    const { customerInfo } = await Purchases.purchasePackage(pkg)
    const purchased = !!customerInfo.entitlements.active[ENTITLEMENT_ID]
    return { purchased, customerInfo }
  } catch (e: any) {
    if (e.userCancelled) return { purchased: false, customerInfo: null }
    throw e
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const info = await Purchases.restorePurchases()
    return !!info.entitlements.active[ENTITLEMENT_ID]
  } catch {
    return false
  }
}
