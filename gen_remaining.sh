#!/bin/bash
# Quick provider file generator for remaining providers
cd /home/team/shared/site/src/integrations/providers

# Define remaining providers as: category/provider:auth:baseurl:actionsdesc
# Logistics (remaining 11)
gen_provider "mercurygate" "logistics" "API Key" "https://api.mercurygate.com/v1"
gen_provider "trimble-tms" "logistics" "OAuth 2.0" "https://api.trimble.com/tms/v1"
gen_provider "samsara" "logistics" "API Token" "https://api.samsara.com/v1"
gen_provider "motive" "logistics" "API Key" "https://api.gofleetalerts.com/v1"
gen_provider "project44" "logistics" "API Key" "https://api.project44.com/v1"
gen_provider "fourkites" "logistics" "API Key" "https://api.fourkites.com/v1"
gen_provider "dat" "logistics" "API Key" "https://api.dat.com/v1"
gen_provider "truckstop" "logistics" "API Key" "https://api.truckstop.com/v1"
gen_provider "descartes" "logistics" "API Key" "https://api.descartes.com/v1"
gen_provider "pcs-tms" "logistics" "API Key" "https://api.pcstms.com/v1"
gen_provider "ascend-tms" "logistics" "API Key" "https://api.ascendtms.com/v1"