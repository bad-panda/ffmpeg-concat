'use strict'

const ffmpeg = require('fluent-ffmpeg')
const onTranscodeProgress = require('ffmpeg-on-progress')

module.exports = async (opts) => {
  const {
    log,
    audio,
    frameFormat,
    framePatterns,
    onProgress,
    output,
    scenes,
    theme,
    encodingOpts = {}
  } = opts

  return new Promise((resolve, reject) => {
    const inputOptions = [
      '-framerate', theme.fps
    ]

    if (frameFormat === 'raw') {
      Array.prototype.push.apply(inputOptions, [
        '-vcodec', 'rawvideo',
        '-pixel_format', 'rgba',
        '-video_size', `${theme.width}x${theme.height}`
      ])
    }

    const cmd = ffmpeg()

    // construct complex filter graph for concat
    const n = scenes.length
    let filter = ''
    let postFilter = ''
    for (let i = 0; i < n; ++i) {
      const scene = scenes[i]
      const transition = framePatterns[i]

      const v0 = i * 2
      cmd.addInput(scene.video)

      filter += `[${v0}:v]trim=${scene.trimStart / 1000}:${scene.trimEnd / 1000}[t${v0}];[t${v0}]setpts=PTS-STARTPTS[v${v0}];`
      postFilter += `[v${v0}]`

      if (transition) {
        const v1 = i * 2 + 1
        cmd.addInput(transition)
        cmd.inputOptions(inputOptions)

        postFilter += `[${v1}:v]`
      }
    }

    let encodingConfig = [
      '-c:v', 'videoCodec' in encodingOpts ? encodingOpts.videoCodec : 'libx264',
      '-profile:v', 'profile' in encodingOpts ? encodingOpts.profile : 'main',
      '-preset', 'preset' in encodingOpts ? encodingOpts.preset : 'medium',
      '-crf', 'crf' in encodingOpts ? encodingOpts.crf : '20',
      '-movflags', 'faststart',
      '-pix_fmt', 'pixelFormat' in encodingOpts ? encodingOpts.pixelFormat : 'yuv420p',
      '-r', theme.fps
    ]

    const chain = `${filter}${postFilter}concat=n=${n * 2 - 1}[outv]`
    if (audio) cmd.addInput(audio)

    cmd.addOptions([
      '-filter_complex', chain,
      '-map', '[outv]'
    ].concat(audio
      ? [ '-map', `${n * 2 - 1}` ]
      : [ ]
    ))

    const outputOptions = []
      // misc
      .concat([
        '-hide_banner',
        '-map_metadata', '-1',
        '-map_chapters', '-1'
      ])

      // video
      // .concat([
      //   '-c:v', 'libx264',
      //   '-profile:v', 'main',
      //   '-preset', 'medium',
      //   '-crf', '20',
      //   '-movflags', 'faststart',
      //   '-pix_fmt', 'yuv420p',
      //   '-r', theme.fps
      // ])

      // video
      .concat(encodingConfig)

      // audio
      .concat(!audio ? [ ] : [
        '-c:a', 'copy',
        '-shortest'
      ])

    if (onProgress) {
      cmd.on('progress', onTranscodeProgress(onProgress, theme.duration))
    }

    cmd
      .outputOptions(outputOptions)
      .output(output)
      .on('start', (cmd) => log({ cmd }))
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}
