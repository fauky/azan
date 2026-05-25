#!/usr/bin/env bash

# ========= CONFIGURATION =========

# Voice filters
HIGH_PASS=120
LOW_PASS=9000

# Voice clarity boost
PRESENCE_FREQ=3000
PRESENCE_GAIN=3

# Noise reduction
AFFTDN_LEVEL=20

# Compression
COMPRESS_THRESHOLD=-20
COMPRESS_RATIO=3

# Loudness normalization (keeps volume high but safe)
LOUDNESS_TARGET=-12
TRUE_PEAK=-1

# Encoding quality
BITRATE="192k"

# Parallel jobs
JOBS=$(nproc)

# =================================

process_file() {

    infile="$1"
    dir=$(dirname "$infile")
    filename=$(basename "$infile")

    outdir="$dir/processed"
    mkdir -p "$outdir"

    outfile="$outdir/$filename"

    echo "Processing: $infile"

    ffmpeg -loglevel error -y -i "$infile" \
    -af "
    adeclip,
    highpass=f=$HIGH_PASS,
    lowpass=f=$LOW_PASS,
    afftdn=nf=-$AFFTDN_LEVEL,
    equalizer=f=$PRESENCE_FREQ:width_type=o:width=2:g=$PRESENCE_GAIN,
    acompressor=threshold=${COMPRESS_THRESHOLD}dB:ratio=${COMPRESS_RATIO}:attack=5:release=50,
    loudnorm=I=$LOUDNESS_TARGET:TP=$TRUE_PEAK:LRA=11
    " \
    -b:a $BITRATE \
    "$outfile"
}

export -f process_file
export HIGH_PASS LOW_PASS PRESENCE_FREQ PRESENCE_GAIN
export AFFTDN_LEVEL COMPRESS_THRESHOLD COMPRESS_RATIO
export LOUDNESS_TARGET TRUE_PEAK BITRATE

# Collect files from:
# 1) current directory
# 2) one-level subdirectories only

find . -maxdepth 2 -type f -name "*.mp3" ! -path "*/processed/*" \
| xargs -P $JOBS -I {} bash -c 'process_file "$@"' _ {}

echo "Processing complete."

