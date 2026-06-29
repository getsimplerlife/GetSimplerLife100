#!/bin/bash
cd /home/team/shared/site
pkill -f "bun run" 2>/dev/null
sleep 1
bun run publish 2>&1