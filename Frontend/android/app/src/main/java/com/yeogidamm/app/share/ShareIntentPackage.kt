package com.yeogidamm.app.share

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class ShareIntentPackage : BaseReactPackage() {

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<*, *>> = emptyList()

    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? =
        if (name == ShareIntentModule.NAME) {
            ShareIntentModule(reactContext)
        } else {
            null
        }

    override fun getReactModuleInfoProvider() =
        ReactModuleInfoProvider {
            mapOf(
                ShareIntentModule.NAME to
                    ReactModuleInfo(
                        ShareIntentModule.NAME,
                        ShareIntentModule::class.java.name,
                        false,
                        false,
                        false,
                        ReactModuleInfo.classIsTurboModule(ShareIntentModule::class.java),
                    ),
            )
        }
}
