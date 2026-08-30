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
 * Do NOT add libagora-ffmpeg.so, libagora-fdkaac.so or libagora-soundtouch.so here.
 * They look like dead media-player codecs and are another ~11 MB on arm64+v7a, but
 * libagora-rtc-sdk.so holds a hard DT_NEEDED on all three, so excluding them makes
 * the core SDK fail to load with UnsatisfiedLinkError the moment a call starts. This
 * was measured, not assumed:
 *
 *   llvm-readelf -d lib/arm64-v8a/libagora-rtc-sdk.so | grep NEEDED
 *
 * Anything added to EXCLUDED_SO should be checked the same way -- confirm no surviving
 * library NEEDS it before trusting that it is only dlopen'd.
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

const BEGIN = '    // @generated begin withAgoraSlimming - do not edit by hand'
const END = '    // @generated end withAgoraSlimming'

const BLOCK = [
  BEGIN,
  '    packagingOptions {',
  '        jniLibs {',
  '            excludes += [',
  ...EXCLUDED_SO.map((p) => `                '${p}',`),
  '            ]',
  '        }',
  '    }',
  END,
].join('\n')

module.exports = function withAgoraSlimming(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withAgoraSlimming: expected a Groovy app/build.gradle')
    }

    const contents = cfg.modResults.contents

    // `expo prebuild` without --clean leaves an existing app/build.gradle in place, so
    // a previously injected block will still be here. Replace it rather than bailing
    // out -- skipping on "already present" lets an edited EXCLUDED_SO list go stale
    // silently, which is exactly the sort of thing you only notice by re-measuring.
    if (contents.includes(BEGIN)) {
      const start = contents.indexOf(BEGIN)
      const end = contents.indexOf(END)
      if (end === -1 || end < start) {
        throw new Error('withAgoraSlimming: found a begin marker with no matching end')
      }
      cfg.modResults.contents =
        contents.slice(0, start) + BLOCK + contents.slice(end + END.length)
      return cfg
    }

    // Anchor on the app module's own `android {` opener so we never land inside a
    // nested block. It is the first line in the file that is exactly `android {`.
    const anchor = /^android \{$/m
    if (!anchor.test(contents)) {
      throw new Error('withAgoraSlimming: could not find the `android {` block')
    }
    cfg.modResults.contents = contents.replace(anchor, `android {\n${BLOCK}\n`)
    return cfg
  })
}
