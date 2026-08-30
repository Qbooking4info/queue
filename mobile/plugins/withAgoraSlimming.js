const { withAppBuildGradle } = require('expo/config-plugins')

/**
 * react-native-agora pulls `io.agora.rtc:agora-special-full`, which ships every
 * optional Agora extension as a separate .so -- ~40 MB per ABI, ~96 MB across the
 * four we build. Queue only ever does a plain 1:1 call (initialize -> enableVideo ->
 * startPreview -> joinChannel in VideoCallScreen.native.tsx and
 * DoctorVideoCallScreen.native.tsx); it never calls enableExtension, setBeautyEffect,
 * enableVirtualBackground, enableSpatialAudio, setAINSMode or startScreenCapture.
 *
 * Agora loads extensions lazily via dlopen, so dropping the .so disables a feature we
 * never switch on. This is Agora's own documented way to shrink the SDK.
 *
 * Kept deliberately: libagora-rtc-sdk, libAgoraRtcWrapper, libvideo_enc/dec (the call
 * itself), and libagora-ffmpeg/fdkaac/soundtouch -- media-player codecs that are very
 * likely unused too, but worth removing in their own build so a regression is easy to
 * attribute.
 *
 * `packagingOptions.excludes` (the shorthand android/app/build.gradle already reads
 * from gradle.properties) maps to *Java* resources in AGP 8 and will not touch .so
 * files, so this has to go through the jniLibs block.
 */
const EXCLUDED_SO = [
  '**/libagora_ai_echo_cancellation_extension.so',
  '**/libagora_ai_echo_cancellation_ll_extension.so',
  '**/libagora_ai_noise_suppression_extension.so',
  '**/libagora_ai_noise_suppression_ll_extension.so',
  '**/libagora_audio_beauty_extension.so',
  '**/libagora_clear_vision_extension.so',
  '**/libagora_content_inspect_extension.so',
  '**/libagora_face_capture_extension.so',
  '**/libagora_face_detection_extension.so',
  '**/libagora_lip_sync_extension.so',
  '**/libagora_screen_capture_extension.so',
  '**/libagora_segmentation_extension.so',
  '**/libagora_spatial_audio_extension.so',
  '**/libagora_video_av1_encoder_extension.so',
  '**/libagora_video_quality_analyzer_extension.so',
]

const MARKER = '// @generated withAgoraSlimming'

const BLOCK = `
    ${MARKER} -- do not edit by hand
    packagingOptions {
        jniLibs {
            excludes += [
${EXCLUDED_SO.map((p) => `                '${p}',`).join('\n')}
            ]
        }
    }
`

module.exports = function withAgoraSlimming(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withAgoraSlimming: expected a Groovy app/build.gradle')
    }
    if (cfg.modResults.contents.includes(MARKER)) {
      return cfg
    }

    // Anchor on the app module's own `android {` opener so we never land inside a
    // nested block. It is the first line in the file that is exactly `android {`.
    const anchor = /^android \{$/m
    if (!anchor.test(cfg.modResults.contents)) {
      throw new Error('withAgoraSlimming: could not find the `android {` block')
    }
    cfg.modResults.contents = cfg.modResults.contents.replace(anchor, `android {\n${BLOCK}`)
    return cfg
  })
}
