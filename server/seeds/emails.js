// Sample broker-forwarded emails — pre-populate the demo.
// Distribution target (one-ish per kanban column):
//   unclassified ×2  |  trade ×6 (OM/facility/SME)
//   whitespace ×1    |  ppl ×1         |  gxb ×2  |  acturis ×1
// Also varied in data richness so completeness scores spread across the range.

export const SEED_EMAILS = [
  // ---------- Trade+ SME (R-01) — small premium, auto-facility ----------
  {
    from: 'james.harrow@howden.com',
    to: 'triage@howden.com',
    subject: 'FW: Property renewal — Meridian Foods Ltd — indication required',
    body: `Hi team,

Property renewal for Meridian Foods Ltd (UK cold-storage food manufacturer, domiciled GB). TIV £18m across 4 UK sites — all exposure GB. Last year's premium ~$22k with a UK lead. Sub-class: All Risks.

5-year loss record: total incurred £14k on £110k paid premiums. 5yr loss ratio 13%. Very clean. Full loss run attached.

Inception date: 12 June 2026. Placement type: renewal. Expiring carrier: Aviva Commercial.

Thanks,
James Harrow
Howden London`,
    attachments: ['MeridianFoods_SOV_2026.pdf', 'MeridianFoods_losses_5yr.pdf'],
  },
  {
    from: 'claire.lovett@howden.com',
    to: 'triage@howden.com',
    subject: 'New business — Linden Botanicals — small cyber cover',
    body: `New business. Linden Botanicals Ltd, UK botanical cosmetics SaaS (domiciled GB, all exposure GB). Cyber liability, limit £1m, target premium $12k. Sub-class: Cyber liability.

No prior claims, no incidents. 5yr loss ratio 0%. Clean paperwork. Inception 1 July 2026.

Thanks,
Claire`,
    attachments: [],
  },

  // ---------- Trade+ Facility (R-02, R-05) ----------
  {
    from: 'oliver.price@howden.com',
    to: 'triage@howden.com',
    subject: 'Mid-market Property renewal — Broadgate Hospitality plc',
    body: `Property renewal for Broadgate Hospitality plc — boutique hotel group, 12 UK sites (London, Edinburgh, Bath). Domicile GB, all exposure GB. TIV £140m. Target premium $95k. Sub-class: Combined Property / BI.

Expiring with AXA XL as lead at $82k. 5-year loss ratio 34% (6 years of clean data, one water damage 2023). Inception 1 June 2026. Trade+ Facility preferred.

Slip and SOV attached.

Regards,
Oliver`,
    attachments: ['Broadgate_slip.pdf', 'Broadgate_SOV.pdf'],
  },
  {
    from: 'producer@ardenvale.co.uk',
    to: 'triage@howden.com',
    subject: 'Cyber cover — Stirling Analytics — mid-market renewal',
    body: `Renewal — Stirling Analytics Ltd, UK analytics SaaS, ~180 staff, domiciled GB, exposure GB + IE. Cyber liability renewal, $8m limit, target premium $55k.

Minor phishing incident 2024, no data loss. 5yr loss ratio 8%. Expiring carrier Beazley at $48k. Inception 15 May 2026.

Trade+ Facility ideal. Slip attached.

Cheers`,
    attachments: ['Stirling_renewal_slip.pdf'],
  },

  // ---------- Trade+ Open Market (C-01 US surplus, R-03 large) ----------
  {
    from: 'mary.chen@howden-ny.com',
    to: 'triage@howden.com',
    subject: 'New business — Rowan Semiconductor — Property + Casualty combined',
    body: `New business, US risk. Rowan Semiconductor Inc (domiciled US/Delaware, all exposure US — CA, TX, AZ fabs). Property TIV $240m, Casualty $50m limit. Target combined premium $420k. Sub-class: All Risks / GL.

Clean losses — 5yr loss ratio 18%, no major incidents. Placement slip drafted. Inception 01 June 2026.

Mary`,
    attachments: ['Rowan_combined_slip.pdf'],
  },
  {
    from: 'producer@ardenvale.co.uk',
    to: 'triage@howden.com',
    subject: 'Cyber cover — Verity Technologies — quick quote',
    body: `SaaS co, ~150 staff, HQ in San Francisco (domiciled US/Delaware, primary exposure US + UK). Verity Technologies Inc. Cyber liability, $5m limit. Budget ~$45k premium. Sub-class: Cyber.

Minor phishing incident last year, no data loss. 5yr loss ratio 12%. Renewal — expiring with Beazley at $38k. Inception target 15 May 2026.

Cheers`,
    attachments: [],
  },

  // ---------- Whitespace (R-04 Marine) & PPL (R-10 Aviation) ----------
  {
    from: 'sophie.klein@kestrel-risk.com',
    to: 'triage@howden.com',
    subject: 'New business — Halberd Maritime AS — hull & machinery',
    body: `Hello,

New business enquiry. Halberd Maritime AS, Norwegian owner (domiciled NO), fleet of 6 offshore supply vessels operating North Sea + West Africa (exposure NO, GB, NG). Hull & Machinery, target premium USD 340k. Sum insured $95m.

5yr loss ratio 28% (5 years supplied). Lloyd's market preferred.

Inception 01 May 2026. Placement slip attached.

Best,
Sophie`,
    attachments: ['Halberd_Slip_v2.pdf'],
  },
  {
    from: 'broker.aviation@howden.com',
    to: 'triage@howden.com',
    subject: 'RE: Fairfield Aerospace — hull war renewal',
    body: `Renewal for Fairfield Aerospace (domiciled GB). Aviation Hull & War, fleet of 12 regional jets operating UK/EU (exposure GB, FR, DE, ES, IT, NL, BE, IE). Target premium ~$280k.

Established leader at Lloyd's (Global Aerospace), PPL placement. 5-year loss ratio 42%. Expiring carrier: Global Aerospace.

Inception 30 April 2026.`,
    attachments: ['Fairfield_renewal_slip.pdf'],
  },

  // ---------- GXB (F-01 binder match) ----------
  {
    from: 'desk@howden-paris.fr',
    to: 'triage@howden.com',
    subject: 'Pelagos Offshore — binder renewal via GXB facility',
    body: `Bonjour,

Pelagos Offshore BV — our existing binder facility renewal. Binder id: GXB-MARINE-24. Marine hull, fleet of 4 vessels, delegated authority scheme. Premium tracking at $95k.

5yr loss ratio 31%. Domiciled NL, trading Europe + West Africa (exposure NL, GB, FR, PT, NG, GH, AO). Inception 15 May 2026. Placement type: renewal.

Attachments: schedule + loss record.

Merci,
Henri`,
    attachments: ['Pelagos_binder_schedule.xlsx', 'Pelagos_losses.pdf'],
  },

  // ---------- GXB (Aviation via binder facility) ----------
  // F-01 (binder) fires before R-10 (Aviation → PPL), so binder_id routes
  // this to GXB. Demonstrates a specialty class landing in a delegated
  // facility rather than the open Lloyd's market.
  {
    from: 'aviation.binders@howden.com',
    to: 'triage@howden.com',
    subject: 'GXB Aviation binder — Skylark Charter Ltd — quarterly declaration',
    body: `Hi team,

Quarterly declaration under our Aviation binder. Binder id: GXB-AVIA-26. Assured: Skylark Charter Ltd — UK-domiciled light jet charter operator (domicile GB, exposure GB, FR, DE, ES, CH). Fleet of 5 light jets and 2 turboprops.

Sub-class: Aviation Hull & Liability (combined). Target premium declaration: $85k for this quarter. Placement type: renewal (quarterly binder declaration).

Clean record — 5yr loss ratio 22% (one minor ground-handling claim 2024). Expiring carrier: syndicate panel under GXB-AVIA-26 binder. Inception 01 May 2026.

Slip and loss run attached.

Thanks,
Aviation binders desk`,
    attachments: ['Skylark_binder_declaration.pdf', 'Skylark_losses_5yr.pdf'],
  },

  // ---------- Acturis (L-02 — bad losses routed to non-Lloyd's retail) ----------
  {
    from: 'richard.flynn@regional-brokers.co.uk',
    to: 'triage@howden.com',
    subject: 'Small Property renewal — Copperleaf Garages — losses-challenged',
    body: `Hi, Property renewal for Copperleaf Garages Ltd (UK motor-trade, 3 sites, domiciled GB, exposure GB). TIV £3.2m. Target premium $18k — SME level. Sub-class: All Risks / motor trade.

Losses have been hairy: 5yr loss ratio 92% (8 years supplied, two escape-of-water incidents 2022/23). Expiring carrier: Covea Commercial at £14k — declined to renew so open market.

Inception 1 June 2026.

Thanks,
Richard`,
    attachments: ['Copperleaf_loss_run.pdf'],
  },

  // ---------- Unclassified: G-04 low confidence ----------
  {
    from: 'admin@smallbroker.co.uk',
    to: 'triage@howden.com',
    subject: 'quote please',
    body: `can you quote this? small office, london, liability cover, premium around 8k.

thanks`,
    attachments: [],
  },

  // ---------- Unclassified: L-01 ugly losses (confidence high enough to trip L-01 not G-04) ----------
  {
    from: 'operations@harrogate-brokers.co.uk',
    to: 'triage@howden.com',
    subject: 'URGENT — Kingfisher Logistics — renewal with heavy losses',
    body: `Need urgent indication.

Kingfisher Logistics Group (UK haulage, domiciled GB, all exposure GB). Property + Auto combined renewal. Expiring with Allianz at £180k premium. Target $220k for 2026. Sub-class: Combined Property/Auto.

Loss history — 5yr loss ratio 178% (two warehouse fires 2023 and 2024). 5 years of data supplied. Loss run attached. Placement type: renewal. Expiring carrier Allianz — declined to renew.

Inception 1 May 2026.`,
    attachments: ['Kingfisher_losses_5yr.pdf', 'Kingfisher_expiring_slip.pdf'],
  },

  // ============================================================
  // EXTENDED BOOK — Aviation-heavy (broker only handles Aviation +
  // Cyber). Every email below is written to be fully referable: all
  // 14 extractable fields are stated so Claude's completeness score
  // tops out at 100%. Distribution spans PPL (open Lloyd's), GXB
  // (binder facilities), Trade+ (US-exposed), and a few review edges.
  // ============================================================

  // ---------- PPL: open Lloyd's aviation (R-10) ----------
  {
    from: 'james.ward@howden-aviation.com',
    to: 'triage@howden.com',
    subject: 'Renewal — Northwind Airways plc — Hull & Liability',
    body: `Hi team,

Northwind Airways plc, UK regional carrier (domiciled GB, exposure GB, FR, DE, NL, IE, ES). Fleet of 24 narrowbody jets. Hull sum insured USD 820m. Sub-class: Aviation Hull & Liability (combined).

Placement type: renewal. Expiring premium USD 1.35m with Global Aerospace as lead at Lloyd's. Target premium USD 1.45m. 5yr loss ratio 38% (5 years supplied, one runway excursion 2022).

Inception 01 July 2026. Standard open-market PPL.

Regards,
James Ward`,
    attachments: ['Northwind_renewal_slip.pdf', 'Northwind_losses_5yr.pdf'],
  },
  {
    from: 'olivia.khan@howden-aviation.com',
    to: 'triage@howden.com',
    subject: 'Aviation Hull War — Caledon Cargo Group — renewal',
    body: `Caledon Cargo Group (UK freighter operator, domiciled GB, exposure GB, US, DE, AE, SG, HK). Fleet of 9 widebody freighters. Sum insured USD 680m. Sub-class: Aviation Hull War.

Placement: renewal. Expiring lead Global Aerospace, $640k. Target premium USD 720k. 5yr loss ratio 29% across 5 years. No hull-war losses in period.

Inception 15 May 2026. PPL.

Thanks,
Olivia`,
    attachments: ['Caledon_hull_war_slip.pdf', 'Caledon_losses.pdf'],
  },
  {
    from: 'broker.aviation@howden.com',
    to: 'triage@howden.com',
    subject: 'New business — Highland Rotorcraft Ltd — helicopter hull',
    body: `New business. Highland Rotorcraft Ltd (UK search-and-rescue, domiciled GB, exposure GB, IE, NO, IS). Fleet of 6 AW189 helicopters. Hull sum insured USD 195m. Sub-class: Aviation Hull (rotor).

Placement: new_business. No expiring policy (new fleet formed 2026). Target premium USD 540k. 5yr loss ratio 12% (3 years supplied from founders' prior operation).

Inception 10 June 2026. PPL preferred.

Best,
Aviation desk`,
    attachments: ['Highland_rotorcraft_slip.pdf'],
  },
  {
    from: 'gerry.mccall@howden-dublin.ie',
    to: 'triage@howden.com',
    subject: 'Renewal — Aran Island Air — regional liability',
    body: `Aran Island Air Ltd, Irish regional (domiciled IE, exposure IE, GB). Fleet 4 ATR72s. Sum insured USD 142m. Sub-class: Aviation Liability.

Placement: renewal. Expiring with Allianz Global Aviation at EUR 310k. Target premium USD 380k. 5yr loss ratio 41% (5 years, minor ground-handling claim 2024).

Inception 01 August 2026. PPL.

Gerry`,
    attachments: ['AranIsland_slip.pdf', 'AranIsland_losses.pdf'],
  },
  {
    from: 'sofia.beltran@howden-madrid.es',
    to: 'triage@howden.com',
    subject: 'Iberian Connect SA — Aviation Hull renewal',
    body: `Iberian Connect SA, Spanish regional (domiciled ES, exposure ES, PT, FR, IT). Fleet 14 Embraer E-190s. Sum insured USD 520m. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring lead Mapfre Aviation at EUR 820k. Target premium USD 980k. 5yr loss ratio 34% (5 years, bird-strike 2023).

Inception 01 September 2026. Standard PPL.

Saludos,
Sofia`,
    attachments: ['Iberian_slip.pdf', 'Iberian_losses.pdf'],
  },
  {
    from: 'ralph.stein@howden-zurich.ch',
    to: 'triage@howden.com',
    subject: 'Renewal — Alpenflug AG — Hull & Liability',
    body: `Alpenflug AG, Swiss charter (domiciled CH, exposure CH, DE, AT, FR, IT, GB). Fleet 8 Pilatus PC-24 and 4 Challenger 650. Sum insured USD 310m. Sub-class: Aviation Hull & Liability (business jets).

Placement: renewal. Expiring lead AIG Aerospace, $520k. Target premium USD 580k. 5yr loss ratio 22% (5 years, one ground damage 2025).

Inception 01 June 2026. PPL.

Ralph`,
    attachments: ['Alpenflug_slip.pdf'],
  },
  {
    from: 'mei.lin@howden-hk.com',
    to: 'triage@howden.com',
    subject: 'New business — Pearl Delta Aviation — regional fleet',
    body: `Pearl Delta Aviation Ltd, Hong Kong regional (domiciled HK, exposure HK, CN, TW, PH, JP, KR). Fleet 11 A220-300. Sum insured USD 740m. Sub-class: Aviation Hull & Liability.

Placement: new_business (new operating certificate). No expiring carrier. Target premium USD 1.1m. 5yr loss ratio 0% (new operator; 3 years of founder's prior carrier history supplied).

Inception 01 October 2026. PPL preferred.

Mei`,
    attachments: ['PearlDelta_slip.pdf', 'PearlDelta_founder_losses.pdf'],
  },
  {
    from: 'lars.nordin@howden-stockholm.se',
    to: 'triage@howden.com',
    subject: 'Renewal — Arctic Link Air — Hull War + Liability',
    body: `Arctic Link Air AB, Swedish regional (domiciled SE, exposure SE, NO, FI, IS, DK, EE). Fleet 7 Dash 8 Q400. Sum insured USD 165m. Sub-class: Aviation Hull War.

Placement: renewal. Expiring lead Hiscox Aerospace, USD 290k. Target premium USD 340k. 5yr loss ratio 18% across 5 years.

Inception 01 July 2026. PPL.

Lars`,
    attachments: ['ArcticLink_slip.pdf', 'ArcticLink_losses.pdf'],
  },
  {
    from: 'adele.pinto@howden-lisbon.pt',
    to: 'triage@howden.com',
    subject: 'Aviation Liability — Lusitânia Cargo Lda — renewal',
    body: `Lusitânia Cargo Lda (domiciled PT, exposure PT, ES, FR, BR, AO, CV). Fleet 5 Boeing 737-800BCF freighters. Sum insured USD 210m. Sub-class: Aviation Liability.

Placement: renewal. Expiring with QBE Aviation at EUR 420k. Target premium USD 495k. 5yr loss ratio 31% (5 years).

Inception 15 June 2026. Open-market PPL.

Adele`,
    attachments: ['Lusitania_slip.pdf'],
  },
  {
    from: 'henri.dubois@howden-paris.fr',
    to: 'triage@howden.com',
    subject: 'Renewal — Mistral Regional — Hull & Liability',
    body: `Mistral Regional SAS (domiciled FR, exposure FR, ES, IT, CH, BE, LU, DE). Fleet 18 ATR72-600. Sum insured USD 430m. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring lead AXA Aviation, EUR 680k. Target premium USD 780k. 5yr loss ratio 39% (5 years, one bird strike 2023).

Inception 01 August 2026. PPL.

Henri`,
    attachments: ['Mistral_slip.pdf', 'Mistral_losses.pdf'],
  },
  {
    from: 'priya.sharma@howden-mumbai.in',
    to: 'triage@howden.com',
    subject: 'Renewal — Deccan Skyline Ltd — Hull & Liability',
    body: `Deccan Skyline Ltd (domiciled IN, exposure IN, AE, SG, TH, LK). Fleet 22 A320neo. Sum insured USD 1.2bn. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring lead ICICI Lombard Aviation at USD 1.8m. Target premium USD 2.1m. 5yr loss ratio 44% (5 years, minor tailstrike 2024).

Inception 01 July 2026. PPL.

Priya`,
    attachments: ['Deccan_slip.pdf', 'Deccan_losses.pdf'],
  },
  {
    from: 'carl.osei@howden-accra.gh',
    to: 'triage@howden.com',
    subject: 'New business — West African Freight Ltd — Cargo aviation',
    body: `West African Freight Ltd (domiciled GH, exposure GH, NG, CI, SN, ML, BF). Fleet 6 Boeing 737-400F. Sum insured USD 158m. Sub-class: Aviation Hull & Liability (cargo).

Placement: new_business. No expiring carrier. Target premium USD 620k. 5yr loss ratio 48% (4 years from predecessor operation).

Inception 01 September 2026. PPL.

Carl`,
    attachments: ['WAFreight_slip.pdf', 'WAFreight_founder_losses.pdf'],
  },
  {
    from: 'mateo.garza@howden-cdmx.mx',
    to: 'triage@howden.com',
    subject: 'Aeroméndez SA — Hull renewal',
    body: `Aeroméndez SA de CV (domiciled MX, exposure MX, US, BZ, GT). Fleet 12 Embraer E-195. Sum insured USD 480m. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring lead Sura Aviación, USD 720k. Target premium USD 830k. 5yr loss ratio 37% (5 years, one ground damage 2023).

Inception 01 June 2026. PPL.

Mateo`,
    attachments: ['Aeromendez_slip.pdf'],
  },
  {
    from: 'linh.tran@howden-singapore.com',
    to: 'triage@howden.com',
    subject: 'Renewal — Sunda Straits Air — Hull & Liability',
    body: `Sunda Straits Air Pte (domiciled SG, exposure SG, ID, MY, TH, VN, PH). Fleet 16 A320ceo. Sum insured USD 640m. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring lead Chubb Aviation Asia, USD 1.1m. Target premium USD 1.24m. 5yr loss ratio 33% (5 years).

Inception 01 October 2026. PPL.

Linh`,
    attachments: ['SundaStraits_slip.pdf', 'SundaStraits_losses.pdf'],
  },

  // ---------- GXB: Aviation binder facilities (F-01) ----------
  {
    from: 'aviation.binders@howden.com',
    to: 'triage@howden.com',
    subject: 'GXB-LIGHTJET-26 — Q2 declaration — Beacon Jets Ltd',
    body: `Quarterly declaration under binder GXB-LIGHTJET-26.

Assured: Beacon Jets Ltd (UK light-jet operator, domiciled GB, exposure GB, FR, ES, IT, CH, AT). Fleet 8 Phenom 300E. Sum insured USD 220m. Sub-class: Aviation Hull & Liability.

Placement: renewal (quarterly binder declaration). Expiring carrier: syndicate panel under GXB-LIGHTJET-26. Target premium USD 168k (Q2 share). 5yr loss ratio 19% (5 years, no hull losses).

Inception 01 May 2026.

Binders desk`,
    attachments: ['Beacon_Q2_declaration.pdf', 'Beacon_losses.pdf'],
  },
  {
    from: 'aviation.binders@howden.com',
    to: 'triage@howden.com',
    subject: 'GXB-AVIA-26 — Lyceum Air declaration',
    body: `Declaration under binder GXB-AVIA-26.

Assured: Lyceum Air Ltd (domiciled GB, exposure GB, FR, DE, BE, NL). Fleet 3 Cessna Citation XLS+. Sum insured USD 68m. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring carrier: GXB-AVIA-26 syndicate panel. Target premium USD 62k. 5yr loss ratio 16% across 5 years.

Inception 01 June 2026.

Binders desk`,
    attachments: ['Lyceum_declaration.pdf'],
  },
  {
    from: 'aviation.binders@howden.com',
    to: 'triage@howden.com',
    subject: 'GXB-HULL-WAR-25 — Rosemarin Charters — binder quote',
    body: `Binder placement under GXB-HULL-WAR-25.

Assured: Rosemarin Charters BV (domiciled NL, exposure NL, DE, BE, LU, FR). Fleet 5 Dassault Falcon 2000. Sum insured USD 140m. Sub-class: Aviation Hull War.

Placement: new_business (joining binder). Expiring carrier: prior was non-binder (AXA Aviation). Target premium USD 98k. 5yr loss ratio 23% (5 years supplied).

Inception 15 May 2026.

Binders desk`,
    attachments: ['Rosemarin_binder_quote.pdf', 'Rosemarin_losses.pdf'],
  },
  {
    from: 'aviation.binders@howden.com',
    to: 'triage@howden.com',
    subject: 'GXB-LIGHTJET-26 — Sycamore Aviation — Q2',
    body: `Binder declaration under GXB-LIGHTJET-26.

Assured: Sycamore Aviation Ltd (domiciled GB, exposure GB, FR, ES, PT). Fleet 4 Embraer Phenom 100. Sum insured USD 45m. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring carrier: GXB-LIGHTJET-26 panel. Target premium USD 38k. 5yr loss ratio 11% (5 years).

Inception 01 May 2026.

Binders desk`,
    attachments: ['Sycamore_Q2.pdf'],
  },
  {
    from: 'rotor.binders@howden.com',
    to: 'triage@howden.com',
    subject: 'GXB-ROTOR-26 — Tavistock Helicopters — declaration',
    body: `Rotor binder declaration under GXB-ROTOR-26.

Assured: Tavistock Helicopters Ltd (domiciled GB, exposure GB, IE, FR). Fleet 6 AW109. Sum insured USD 86m. Sub-class: Aviation Hull (rotor).

Placement: renewal. Expiring carrier: GXB-ROTOR-26 panel. Target premium USD 95k. 5yr loss ratio 26% (5 years, one hard landing 2024).

Inception 01 July 2026.

Rotor binders desk`,
    attachments: ['Tavistock_declaration.pdf'],
  },
  {
    from: 'aviation.binders@howden.com',
    to: 'triage@howden.com',
    subject: 'GXB-CARGO-AVIA-25 — Orient Freight Express — renewal',
    body: `Binder renewal under GXB-CARGO-AVIA-25.

Assured: Orient Freight Express Sdn Bhd (domiciled MY, exposure MY, SG, TH, VN, PH, ID). Fleet 4 Boeing 757-200F. Sum insured USD 184m. Sub-class: Aviation Hull & Liability (cargo).

Placement: renewal. Expiring carrier: GXB-CARGO-AVIA-25 panel. Target premium USD 145k. 5yr loss ratio 34% (5 years).

Inception 01 June 2026.

Binders desk`,
    attachments: ['OrientFreight_renewal.pdf', 'OrientFreight_losses.pdf'],
  },
  {
    from: 'aviation.binders@howden.com',
    to: 'triage@howden.com',
    subject: 'GXB-AVIA-26 — Carrickfergus Aero — declaration',
    body: `Declaration under GXB-AVIA-26.

Assured: Carrickfergus Aero Ltd (domiciled GB, exposure GB, IE, FR). Fleet 2 King Air 350i and 1 Citation CJ4. Sum insured USD 22m. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring carrier: GXB-AVIA-26 panel. Target premium USD 19k. 5yr loss ratio 9% (5 years, no losses).

Inception 01 May 2026.

Binders desk`,
    attachments: ['Carrickfergus_declaration.pdf'],
  },

  // ---------- Trade+: US-exposed aviation (C-01) ----------
  {
    from: 'diane.rogers@howden-ny.com',
    to: 'triage@howden.com',
    subject: 'New business — Cascadia Regional Air — Hull & Liability',
    body: `Cascadia Regional Air Inc (domiciled US/WA, exposure US — WA, OR, CA, ID, NV). Fleet 14 ERJ-175. Sum insured USD 540m. Sub-class: Aviation Hull & Liability.

Placement: new_business. No expiring carrier (new certificate). Target premium USD 1.05m. 5yr loss ratio 21% (3 years founder history).

Inception 01 August 2026. US surplus-lines placement.

Diane`,
    attachments: ['Cascadia_slip.pdf', 'Cascadia_founder_losses.pdf'],
  },
  {
    from: 'mike.callahan@howden-ny.com',
    to: 'triage@howden.com',
    subject: 'Renewal — Redwood Charter Group Inc — Hull & Liability',
    body: `Redwood Charter Group Inc (domiciled US/DE, exposure US — CA, NV, AZ, CO, TX, FL). Fleet 18 Bombardier Challenger 350. Sum insured USD 760m. Sub-class: Aviation Hull & Liability (business jets).

Placement: renewal. Expiring lead USAIG at USD 1.45m. Target premium USD 1.62m. 5yr loss ratio 27% (5 years, one ground damage 2024).

Inception 01 July 2026. US surplus lines.

Mike`,
    attachments: ['Redwood_renewal.pdf', 'Redwood_losses.pdf'],
  },
  {
    from: 'diane.rogers@howden-ny.com',
    to: 'triage@howden.com',
    subject: 'Shoreline Helicopters LLC — Hull War renewal',
    body: `Shoreline Helicopters LLC (domiciled US/LA, exposure US — LA, TX, MS, AL). Fleet 11 Sikorsky S-92 offshore SAR. Sum insured USD 320m. Sub-class: Aviation Hull War.

Placement: renewal. Expiring lead Starr Aviation, USD 820k. Target premium USD 930k. 5yr loss ratio 31% (5 years, one rotor strike 2023).

Inception 01 June 2026. US surplus lines.

Diane`,
    attachments: ['Shoreline_renewal.pdf', 'Shoreline_losses.pdf'],
  },
  {
    from: 'mike.callahan@howden-ny.com',
    to: 'triage@howden.com',
    subject: 'Great Lakes Cargo Air Inc — renewal',
    body: `Great Lakes Cargo Air Inc (domiciled US/IL, exposure US — IL, MI, OH, WI, IN, KY, MO). Fleet 7 Boeing 767-300F. Sum insured USD 410m. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring lead AIG Aviation, USD 860k. Target premium USD 960k. 5yr loss ratio 29% (5 years).

Inception 01 September 2026. US surplus lines.

Mike`,
    attachments: ['GreatLakes_renewal.pdf'],
  },

  // ---------- Aviation losses → review (L-01) or acturis (L-02) ----------
  {
    from: 'anna.vitale@howden-rome.it',
    to: 'triage@howden.com',
    subject: 'URGENT — Tyrrhenian Air — renewal with heavy losses',
    body: `Tyrrhenian Air SpA (domiciled IT, exposure IT, FR, ES, MT, GR). Fleet 9 A319s. Sum insured USD 285m. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring lead Generali Aviazione, EUR 520k — declined to renew. Target premium USD 680k. 5yr loss ratio 172% (5 years — two major incidents 2023 and 2024 hull write-offs).

Inception 01 June 2026. Unlikely to place in open market.

Anna`,
    attachments: ['Tyrrhenian_losses.pdf', 'Tyrrhenian_expiring.pdf'],
  },
  {
    from: 'kofi.mensah@howden-lagos.ng',
    to: 'triage@howden.com',
    subject: 'Renewal — Benin Delta Aviation — loss-heavy',
    body: `Benin Delta Aviation Ltd (domiciled NG, exposure NG, GH, CM, BJ, TG). Fleet 6 ATR42s. Sum insured USD 88m. Sub-class: Aviation Hull & Liability.

Placement: renewal. Expiring lead Leadway Aviation at USD 340k. Target premium USD 420k. 5yr loss ratio 96% (5 years, two forced landings 2022/24).

Inception 01 July 2026. Likely non-Lloyd's retail.

Kofi`,
    attachments: ['BeninDelta_losses.pdf'],
  },

  // ---------- CYBER — broker's other book (mostly Trade+) ----------
  {
    from: 'helena.schroeder@howden-munich.de',
    to: 'triage@howden.com',
    subject: 'Renewal — Bayerische Fintech AG — Cyber liability',
    body: `Bayerische Fintech AG (domiciled DE, exposure DE, AT, CH, LU). Payments SaaS. Revenue EUR 480m. Notional data asset value USD 220m. Sub-class: Cyber liability.

Placement: renewal. Expiring lead Beazley at EUR 340k. Target premium USD 420k. 5yr loss ratio 19% (one phishing claim 2024, paid EUR 60k).

Inception 01 July 2026. Trade+ Facility preferred.

Helena`,
    attachments: ['Bayerische_cyber_slip.pdf', 'Bayerische_losses.pdf'],
  },
  {
    from: 'sam.okafor@howden-ny.com',
    to: 'triage@howden.com',
    subject: 'New business — Harbor Health Data Inc — Cyber',
    body: `Harbor Health Data Inc (domiciled US/DE, exposure US — NY, NJ, PA, MA). Healthcare data platform. Notional data asset value USD 540m. Sub-class: Cyber liability (healthcare).

Placement: new_business. No expiring carrier. Target premium USD 1.15m. 5yr loss ratio 0% (new co; 2 years founder history supplied).

Inception 01 August 2026. US surplus lines (C-01 expected).

Sam`,
    attachments: ['HarborHealth_cyber_slip.pdf'],
  },
  {
    from: 'claire.lovett@howden.com',
    to: 'triage@howden.com',
    subject: 'Renewal — Thornbury Analytics — mid-market Cyber',
    body: `Thornbury Analytics Ltd (domiciled GB, exposure GB, IE, FR, NL). B2B data analytics SaaS. Notional data asset value USD 180m. Sub-class: Cyber liability.

Placement: renewal. Expiring lead CFC at GBP 85k. Target premium USD 110k. 5yr loss ratio 14% (one BEC incident 2023, paid GBP 18k).

Inception 01 June 2026.

Claire`,
    attachments: ['Thornbury_cyber_slip.pdf'],
  },
  {
    from: 'diane.rogers@howden-ny.com',
    to: 'triage@howden.com',
    subject: 'Peninsula Gaming LLC — Cyber renewal',
    body: `Peninsula Gaming LLC (domiciled US/NV, exposure US — NV, NJ, PA, MI). Online gaming operator. Notional data asset value USD 310m. Sub-class: Cyber liability.

Placement: renewal. Expiring lead Chubb at USD 480k. Target premium USD 565k. 5yr loss ratio 28% (one DDoS extortion 2024, paid USD 95k).

Inception 15 August 2026. US surplus lines.

Diane`,
    attachments: ['Peninsula_cyber_slip.pdf', 'Peninsula_losses.pdf'],
  },
  {
    from: 'nora.pakulski@howden-warsaw.pl',
    to: 'triage@howden.com',
    subject: 'CEE Cloud sp. z o.o. — Cyber — mid-market',
    body: `CEE Cloud sp. z o.o. (domiciled PL, exposure PL, CZ, SK, HU, RO). IaaS provider. Notional data asset value USD 85m. Sub-class: Cyber liability.

Placement: renewal. Expiring lead Allianz Cyber Polska at PLN 420k. Target premium USD 145k. 5yr loss ratio 11% (no claims).

Inception 01 September 2026. Trade+ Facility.

Nora`,
    attachments: ['CEECloud_slip.pdf'],
  },
  {
    from: 'operations@harrogate-brokers.co.uk',
    to: 'triage@howden.com',
    subject: 'Marlowe Logistics Data Ltd — Cyber renewal with losses',
    body: `Marlowe Logistics Data Ltd (domiciled GB, exposure GB, IE, FR, DE, ES). Supply-chain platform. Notional data asset value USD 64m. Sub-class: Cyber liability.

Placement: renewal. Expiring lead Hiscox at GBP 78k — declined. Target premium USD 145k. 5yr loss ratio 118% (ransomware incident 2024 paid GBP 520k).

Inception 01 July 2026. Loss-challenged — likely non-Lloyd's.

Harrogate ops`,
    attachments: ['Marlowe_losses.pdf', 'Marlowe_expiring.pdf'],
  },
  {
    from: 'carlos.rivera@howden-madrid.es',
    to: 'triage@howden.com',
    subject: 'Pamplona Retail Data SL — Cyber renewal',
    body: `Pamplona Retail Data SL (domiciled ES, exposure ES, PT, FR, IT). Retail POS network. Notional data asset value USD 92m. Sub-class: Cyber liability.

Placement: renewal. Expiring lead Mapfre Cyber at EUR 110k. Target premium USD 155k. 5yr loss ratio 24% (card-skimming incident 2023 paid EUR 42k).

Inception 01 June 2026.

Carlos`,
    attachments: ['Pamplona_cyber_slip.pdf'],
  },
];
