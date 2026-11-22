# Tiny Stack VM — two-pass validated interpreter

[![bounty](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)](https://make.fun)
[![rank](https://make.fun/badge/Climaxcuy/tiny-stack-vm/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/Climaxcuy/tiny-stack-vm/reward.svg)](https://make.fun)

Interpreter deterministik untuk ISA stack machine make.fun: pre-pass memvalidasi tiap alamat byte program sebelum eksekusi, lalu loop eksekusi memeriksa ulang semua kondisi dinamis (trap 2–11) persis seperti VM referensi.
