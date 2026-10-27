-- Seed: 9 starter blog posts about HVAC repair. Run AFTER schema-directory.sql (adds posts.cover_image).
-- Safe to re-run: existing slugs are skipped.

insert into public.posts (slug, title, excerpt, meta_description, content, cover_image, status, published_at)
values (
  'ac-not-cooling-common-causes',
  $post$AC Not Cooling? Common Causes and When to Call a Pro$post$,
  $post$Warm air from your vents is stressful in hot weather. Here are the usual suspects, the safe checks you can make yourself, and the signs it's time for a professional.$post$,
  $post$AC blowing warm air? Learn common reasons an air conditioner stops cooling, safe checks to make first, and when to call an HVAC professional.$post$,
  $post$When your air conditioner runs but the house stays warm, it's easy to assume the worst. Sometimes the cause is simple. Other times it needs a trained technician. This guide covers the common reasons an AC stops cooling and how to tell which situation you're in.

## Safe things to check first

Before calling anyone, a few quick checks cost nothing:

- **Thermostat settings.** Make sure it is set to *Cool*, the temperature is below the current room temperature, and the batteries are fresh if it uses them.
- **Air filter.** A badly clogged filter restricts airflow and can make a system struggle. Replace or clean it if it is dirty.
- **Vents and registers.** Check that supply and return vents are open and not blocked by furniture or rugs.
- **Outdoor unit.** Look for leaves, grass clippings or debris around the outside unit. Keep plants trimmed back so air can move freely.

Do not open panels or reach inside the unit. Electrical and refrigerant components should only be handled by a professional.

## Common causes a technician looks for

- **Dirty coils.** Dust and grime on the indoor or outdoor coils reduce heat transfer.
- **Low refrigerant.** Air conditioners don't "use up" refrigerant, so low levels usually point to a leak that needs to be found and repaired.
- **Frozen evaporator coil.** Ice on the indoor coil blocks airflow and cooling. It is often a symptom of restricted airflow or a refrigerant issue.
- **Failed capacitor, contactor or fan motor.** These electrical parts commonly wear out and can stop the outdoor unit from running even though indoor fans still blow.
- **Compressor problems.** The compressor is the heart of the system, and failures are typically a job for a professional.

## When to call for help

Call a professional if the system still doesn't cool after the basic checks, you see ice on the lines or unit, you hear grinding or squealing, the breaker keeps tripping, or there is any burning smell. If the unit is frozen, turn the system off at the thermostat so the ice can thaw before a technician arrives.

## Heat safety

During a heat wave, indoor temperatures can become dangerous for children, older adults and anyone with health conditions. If your home can't be cooled, consider moving to a cooler location while you wait for repairs.

Need help finding a local contractor? Submit a request and we'll help you look for suitable options in your area. We can't promise availability or response times.$post$,
  '/blog/ac-not-cooling-common-causes.svg',
  'published',
  now() - interval '9 days'
)
on conflict (slug) do nothing;

insert into public.posts (slug, title, excerpt, meta_description, content, cover_image, status, published_at)
values (
  'furnace-not-heating-what-to-check',
  $post$Furnace Not Heating? What to Check Before You Call for Repair$post$,
  $post$A cold house is more than an inconvenience. These safe checks can sometimes solve the problem, and these warning signs mean you should stop and call a professional.$post$,
  $post$Furnace not producing heat? Safe checks to try first, common causes of furnace failure, and when to call a heating professional.$post$,
  $post$A furnace that won't produce heat in cold weather needs attention quickly. Some causes are simple settings issues. Others involve gas, electrical or combustion components that only a qualified technician should touch.

## Safe checks to try first

- **Thermostat.** Confirm it is set to *Heat*, the set temperature is above the room temperature, and the display is working. Replace batteries if applicable.
- **Power.** Check that the furnace switch (often like a light switch near the unit) is on and that the circuit breaker hasn't tripped. If a breaker trips again right away, stop and call a professional.
- **Air filter.** A clogged filter can cause the furnace to overheat and shut off. Replace it if it is dirty.
- **Vents.** Make sure registers are open and unobstructed.

If you have a gas furnace, never try to relight a pilot or bypass safety controls unless you are following the manufacturer's instructions and are confident doing so. When in doubt, call a professional.

## Common reasons a furnace stops heating

- **Dirty filter or restricted airflow** causing the limit switch to shut the unit down.
- **Ignition problems.** Failed igniters or flame sensors prevent the burners from staying lit.
- **Thermostat faults** that don't send the call for heat.
- **Blower motor or capacitor failure** so heat is produced but not distributed.
- **Gas supply or control board issues**, which require professional diagnosis.

## Warning signs: stop and get help

Treat these seriously:

- A smell of gas, a hissing sound near gas lines, or a rotten-egg odor.
- A carbon monoxide alarm sounding.
- Soot, scorching or unusual flames around the furnace.
- Persistent burning smells.

If you smell gas or your CO alarm sounds, leave the building and contact your gas utility or local emergency services from a safe location. Do not use light switches or phones inside until you are safe.

## Staying warm while you wait

Close off rooms you don't need, use extra blankets, and never use a gas oven, grill or fuel-burning heater indoors to heat your home. These can release carbon monoxide.

We can help you look for local heating contractors, though we can't guarantee availability or timing. Submit a request to get started.$post$,
  '/blog/furnace-not-heating-what-to-check.svg',
  'published',
  now() - interval '8 days'
)
on conflict (slug) do nothing;

insert into public.posts (slug, title, excerpt, meta_description, content, cover_image, status, published_at)
values (
  'water-leaking-from-hvac-system',
  $post$Why Is Water Leaking From My HVAC System?$post$,
  $post$Water around your indoor unit can damage floors and ceilings. Learn the usual causes of HVAC leaks and what to do right away to limit the damage.$post$,
  $post$Water leaking from your air conditioner or furnace? Common causes of HVAC leaks, immediate steps to limit damage, and when to call a professional.$post$,
  $post$Finding water around your HVAC equipment is a sign something needs attention. Moisture can damage drywall, flooring and insulation, and can encourage mold if left alone. Here is why leaks happen and how to respond.

## Why air conditioners produce water

As your AC cools air, it removes humidity. That moisture collects on the evaporator coil and drains away through a condensate line to a drain or pump. A leak usually means that water has somewhere else to go.

## Common causes of HVAC water leaks

- **Clogged condensate drain line.** Algae and debris can block the line so water backs up and overflows the pan.
- **Cracked or rusted drain pan.** Older pans can corrode and leak.
- **Frozen evaporator coil.** When ice melts it can overwhelm the pan. Freezing often points to airflow or refrigerant problems.
- **Dirty air filter.** Restricted airflow can contribute to a frozen coil.
- **Failed condensate pump.** Systems that rely on a pump to lift water can leak if it stops working.
- **Poor installation or disconnected lines.** Improper slope or loose connections can cause drips.

High-efficiency furnaces also produce condensation and have drain lines that can clog.

## What to do right away

1. **Turn the system off** at the thermostat. Running a system that is leaking can make damage worse.
2. **Mop up standing water** and, if safe, place towels or a container to catch drips.
3. **Check the air filter** and replace it if it is dirty.
4. **Do not** open electrical panels or work near water around live electrical components. If water has reached electrical equipment or outlets, turn off power at the breaker if you can reach it safely.

## When to call a professional

Call a technician if leaks continue after the system is off and filter replaced, if you see ice, if water is near electrical equipment, or if you have recurring leaks. A professional can clear drain lines, check the pan and pump, and diagnose underlying airflow or refrigerant issues.

Large amounts of water, ceiling stains or any signs of mold should be addressed promptly. Submit a request and we'll help you look for local HVAC contractors.$post$,
  '/blog/water-leaking-from-hvac-system.svg',
  'published',
  now() - interval '7 days'
)
on conflict (slug) do nothing;

insert into public.posts (slug, title, excerpt, meta_description, content, cover_image, status, published_at)
values (
  'strange-hvac-noises-what-they-mean',
  $post$Strange HVAC Noises: What They Might Mean$post$,
  $post$Banging, squealing, buzzing or clicking, your system's sounds can hint at what's wrong. Here is a plain-language guide to common noises and how urgent they are.$post$,
  $post$Banging, squealing, buzzing or hissing from your HVAC system? What common noises may mean and when to shut the system off and call a pro.$post$,
  $post$Heating and cooling systems are never silent, but new or louder noises are worth paying attention to. Sounds can give clues about what is wearing out. This guide isn't a substitute for a professional diagnosis, but it can help you decide how quickly to act.

## Common noises and what they can indicate

- **Squealing or screeching.** Often a worn belt or a failing motor bearing in the blower or outdoor fan.
- **Grinding.** Metal-on-metal contact can mean a failing motor bearing or other serious wear. Turn the system off to avoid more damage.
- **Banging or clanking.** A loose or broken internal part, such as a fan blade or motor mount, can cause banging.
- **Rattling.** Loose panels or debris are common causes and are often minor, but they can also signal loose components.
- **Buzzing or humming.** Electrical issues such as a failing capacitor, contactor or loose wiring can produce buzzing.
- **Clicking.** A single click at start-up is normal. Repeated clicking can suggest an electrical or ignition problem.
- **Hissing or bubbling.** This may point to a refrigerant leak or a pressurized issue. Treat hissing near gas lines as a safety concern.
- **Booming or popping on furnace start-up.** Can be related to delayed ignition or expanding ductwork. Delayed ignition should be inspected.

## How urgent is it?

**Turn the system off and call a professional** if you hear grinding, loud banging, or if noises come with burning smells, smoke, tripped breakers or reduced performance.

**Schedule a service visit soon** for persistent squealing, buzzing or rattling that doesn't go away.

**Monitor** a minor, consistent noise, like a panel vibrating, but have it looked at during your next maintenance visit.

## What you can safely do

Check that the air filter is clean, vents are open, and the area around the outdoor unit is clear of debris. Don't remove panels or reach inside the equipment while it is powered.

Noise is often the earliest warning sign. Catching a worn part early can sometimes prevent a bigger repair. Submit a request and we'll help you look for local contractors, though availability can't be guaranteed.$post$,
  '/blog/strange-hvac-noises-what-they-mean.svg',
  'published',
  now() - interval '6 days'
)
on conflict (slug) do nothing;

insert into public.posts (slug, title, excerpt, meta_description, content, cover_image, status, published_at)
values (
  'thermostat-problems-troubleshooting',
  $post$Thermostat Problems: Blank Screen, Wrong Temperature or No Response$post$,
  $post$Sometimes the thermostat, not the furnace or AC, is the real problem. Learn the signs of a faulty thermostat and which quick checks are safe to try.$post$,
  $post$Thermostat blank, unresponsive or reading the wrong temperature? Safe troubleshooting steps and when a professional should take a look.$post$,
  $post$The thermostat is the control center of your HVAC system. When it misbehaves, your heating or cooling can seem broken even if the equipment itself is fine. Here are common thermostat problems and the safe steps you can take.

## Common symptoms

- A **blank or dim screen**
- The system **won't turn on** or doesn't respond to changes
- The room temperature **doesn't match** the display
- The system **short cycles**, turning on and off frequently
- The thermostat **loses its schedule** or settings

## Safe checks

- **Replace the batteries** if your thermostat uses them. This is the most common fix for a blank screen.
- **Check the mode and temperature settings.** Make sure it's set to Heat or Cool and the target is appropriate.
- **Confirm the schedule or hold.** A programmed schedule or a hold setting can override what you expect.
- **Check the breaker and furnace switch** in case the thermostat isn't receiving power from the system.
- **Look at the location.** Direct sunlight, drafts, or heat from lamps and appliances can cause misleading readings.
- **Gently clean the thermostat.** Dust can affect some models. Follow the manufacturer's instructions.

Don't rewire a thermostat unless you are experienced and have switched off power at the breaker. Wiring mistakes can damage equipment.

## When it may be more than the thermostat

If the thermostat is working but the system still doesn't respond, the problem may be with the furnace, air conditioner, control board or wiring. Signs include a thermostat that shows a "call for heat/cool" without the equipment starting, error codes, or breakers that trip.

## Replacing or upgrading

Older thermostats can drift out of calibration. A programmable or smart thermostat may help you manage schedules, but compatibility depends on your system's wiring and voltage. A professional can confirm the right model and install it safely.

If you're unsure whether the thermostat or the equipment is at fault, a technician can test both. Submit a request and we'll help you look for suitable local options.$post$,
  '/blog/thermostat-problems-troubleshooting.svg',
  'published',
  now() - interval '5 days'
)
on conflict (slug) do nothing;

insert into public.posts (slug, title, excerpt, meta_description, content, cover_image, status, published_at)
values (
  'hvac-maintenance-checklist-by-season',
  $post$HVAC Maintenance Checklist: What to Do Each Season$post$,
  $post$Regular care helps your system run reliably. Here's a season-by-season checklist of homeowner tasks, plus the jobs best left to a professional.$post$,
  $post$A simple seasonal HVAC maintenance checklist for homeowners: filters, vents, outdoor unit care, and when to schedule professional service.$post$,
  $post$A little routine attention can help your heating and cooling equipment run as intended and may help you notice small problems before they become breakdowns. This checklist covers simple homeowner tasks and when to bring in a professional.

## Year-round

- **Check the air filter every month or two** and replace or clean it as needed. Households with pets, allergies or heavy dust may need to do this more often.
- **Keep vents and registers clear** of furniture, curtains and clutter.
- **Listen and look.** Note any new noises, smells, drips or uneven temperatures and have them checked.

## Spring: before cooling season

- Clear leaves, grass and debris from around the outdoor unit and trim plants back so airflow isn't blocked.
- Check that the outdoor unit sits level and the area drains well.
- Run the AC briefly to confirm it cools before the first hot spell.
- Consider scheduling a professional cooling tune-up, which typically includes inspecting electrical parts, coils, drainage and refrigerant-related performance.

## Summer

- Keep the area around the outdoor unit clear.
- Watch for ice on the lines or unit, water around the indoor unit, or weak airflow, which can signal problems.
- Use curtains or blinds to reduce heat gain from sunny windows.

## Fall: before heating season

- Replace the filter.
- Test the thermostat and heating mode early so you aren't surprised by a cold snap.
- Keep flammable items away from the furnace and water heater.
- Make sure smoke and carbon monoxide detectors work, and replace batteries as recommended.
- Consider a professional heating inspection, which can include checking the burners, heat exchanger, venting and safety controls.

## Winter

- Keep snow and ice clear of outdoor vents, intake and exhaust pipes.
- Keep up with filter changes, since furnaces often run more.
- Pay attention to any unusual odors or sounds.

## What to leave to professionals

Refrigerant handling, gas connections, electrical repairs, heat exchanger inspections and combustion testing should be performed by qualified technicians.

Tip: write the dates of filter changes and service visits somewhere you'll see them.

When something does go wrong, submit a request and we'll help you look for local HVAC contractors, subject to availability.$post$,
  '/blog/hvac-maintenance-checklist-by-season.svg',
  'published',
  now() - interval '4 days'
)
on conflict (slug) do nothing;

insert into public.posts (slug, title, excerpt, meta_description, content, cover_image, status, published_at)
values (
  'how-to-choose-an-hvac-contractor',
  $post$How to Choose an HVAC Contractor: Questions to Ask Before You Hire$post$,
  $post$Not every contractor is the right fit. Here are practical questions to ask and things to verify yourself before you agree to any repair or installation.$post$,
  $post$Choosing an HVAC contractor? Questions to ask about licensing, insurance, estimates, warranties and references before you hire.$post$,
  $post$Hiring a contractor for heating or cooling work is easier when you know what to ask. Requirements differ by state and city, so use this as a starting point and confirm details with your local licensing authority.

## Verify credentials yourself

- **Licensing.** Many areas require HVAC contractors or technicians to be licensed. Ask for the license number and verify it with the state or local licensing board.
- **Insurance.** Ask whether the company carries liability insurance and workers' compensation, and request proof if you're unsure.
- **Business details.** A real business should have a physical or registered presence, a working phone number and a clear company name.

A referral service like ours does not guarantee that any contractor is licensed, insured or available. Always confirm for yourself.

## Questions to ask

1. **Do you service my type of equipment and my area?**
2. **How do you charge?** Ask about diagnostic fees, hourly rates, flat-rate pricing and any trip charges.
3. **Will you provide a written estimate** before work starts, and what happens if the scope changes?
4. **What warranty applies** to parts and labor?
5. **Who will do the work?** Employees or subcontractors?
6. **What is the timeline,** and how will you communicate if it changes?
7. **Can you provide references** or examples of similar work?

## Compare more than price

The lowest quote isn't always the best value. Compare what each estimate includes, the parts being used, warranties and how clearly the contractor explains the problem.

## Red flags

- Pressure to decide immediately or demands for large cash payments up front.
- Reluctance to provide a license number, written estimate or contract.
- Quotes that arrive without ever inspecting the equipment.
- Recommending a full replacement without explaining the diagnosis.
- Unmarked vehicles with no verifiable company information.

## Get it in writing

Before work begins, make sure the agreement lists the work to be done, equipment and parts, total price, payment schedule, warranty terms and expected timeline.

Ready to look for options? Submit a service request and we'll help you look for suitable local contractors where available. Contractors are independent businesses.$post$,
  '/blog/how-to-choose-an-hvac-contractor.svg',
  'published',
  now() - interval '3 days'
)
on conflict (slug) do nothing;

insert into public.posts (slug, title, excerpt, meta_description, content, cover_image, status, published_at)
values (
  'gas-smell-carbon-monoxide-hvac-safety',
  $post$Gas Smell or Carbon Monoxide? HVAC Safety You Shouldn't Ignore$post$,
  $post$Some heating problems are emergencies. Know the warning signs of a gas leak or carbon monoxide exposure and what to do, starting with getting to safety.$post$,
  $post$Gas smell or carbon monoxide alarm? Learn the warning signs, what to do immediately, and how to reduce heating-related safety risks at home.$post$,
  $post$Most HVAC problems are about comfort. A few are about safety. If you ever suspect a gas leak or carbon monoxide (CO) exposure, your priority is getting everyone to safety, not fixing the equipment.

## If you smell gas

Natural gas is usually given an odor, often described as rotten eggs, so leaks can be noticed. If you smell gas or hear hissing near a gas line:

- **Leave the building** right away with everyone inside, including pets if it's safe to do so.
- **Don't operate light switches, appliances or anything that could create a spark** while inside.
- **From a safe distance outside,** contact your gas utility's emergency number or local emergency services.
- **Don't re-enter** until professionals tell you it is safe.

## Carbon monoxide basics

Carbon monoxide is a colorless, odorless gas produced when fuel doesn't burn completely. Furnaces, boilers, water heaters, fireplaces, generators and vehicles can all be sources if they malfunction or aren't vented properly.

**Possible symptoms** include headache, dizziness, nausea, confusion, weakness and chest discomfort. Symptoms can improve when you leave the building and return when you come back. Several people or pets feeling unwell at once is a warning sign.

## If a CO alarm sounds

- **Get everyone outside into fresh air.**
- **Call emergency services** from outside and tell them about the alarm and any symptoms.
- **Don't go back in** until it has been checked and declared safe.
- Have the heating system and fuel-burning appliances inspected by a qualified professional before using them again.

## Reducing risk

- **Install CO alarms** on every level of your home and near sleeping areas, and test them regularly following the manufacturer's directions.
- **Install smoke alarms** and replace batteries as recommended.
- **Have fuel-burning heating equipment inspected** by a qualified professional on a regular basis.
- **Keep vents and flues clear** of snow, ice, nests and debris.
- **Never use a gas oven, grill, camp stove or generator indoors** or in an attached garage to heat or power your home.

## Other warning signs

Yellow or orange burner flames (instead of blue), soot around appliances, excess moisture on windows, or a pilot light that frequently goes out can indicate combustion problems that should be inspected.

Our request form is for non-emergency repair help. In an emergency, contact your gas utility or emergency services first.$post$,
  '/blog/gas-smell-carbon-monoxide-hvac-safety.svg',
  'published',
  now() - interval '2 days'
)
on conflict (slug) do nothing;

insert into public.posts (slug, title, excerpt, meta_description, content, cover_image, status, published_at)
values (
  'hvac-repair-or-replace-aging-system',
  $post$Repair or Replace? How to Think About an Aging HVAC System$post$,
  $post$A big repair bill on an older system raises a big question. Here are the factors to weigh, and the questions to ask your contractor, before you decide.$post$,
  $post$Should you repair or replace your aging HVAC system? Key factors to weigh, questions to ask a contractor, and why a second opinion can help.$post$,
  $post$When an older heating or cooling system breaks down, you face a choice: pay for a repair or invest in a new system. There is no single right answer. These factors can help you think it through.

## Factors to weigh

- **Age of the equipment.** Many systems are designed to last for many years, but lifespan varies by type, usage, climate and maintenance. Ask a professional how the age of your specific equipment affects the decision.
- **Repair history.** Frequent breakdowns can be a sign that the system is wearing out.
- **Cost of the repair relative to replacement.** A small repair on an otherwise healthy system is different from a major component failure on an old one. Ask for written estimates for both options.
- **Energy use.** Older equipment may be less efficient than modern models, which could affect your utility bills. A contractor can explain what to expect, but don't rely on promises of guaranteed savings.
- **Comfort.** Uneven temperatures, humidity problems and noise can point to equipment or ductwork issues.
- **Refrigerant type.** Some older systems use refrigerants that are being phased out, which may affect the cost and availability of repairs. Ask your technician about your system.
- **Safety.** Problems such as a cracked heat exchanger on a furnace are safety issues, and replacement may be the responsible path.

## Questions to ask your contractor

1. What exactly is wrong, and can you show me?
2. What is the expected cost and warranty for the repair?
3. What would a replacement cost, and what does it include?
4. Is the existing ductwork suitable for new equipment?
5. Are there rebates or incentives available in my area? These change often, so check current programs.

## Get a second opinion

For major repairs or replacement recommendations, getting more than one assessment can give you confidence. Compare what each contractor includes rather than only the total price.

## Don't forget the whole system

Equipment size matters. A system that's too large or too small can run inefficiently. A reputable contractor should assess your home's needs instead of simply matching the old unit.

Whichever route you choose, get the details in writing. If you'd like help finding local contractors to evaluate your options, submit a request. We can't guarantee availability, pricing or outcomes, since contractors are independent businesses.$post$,
  '/blog/hvac-repair-or-replace-aging-system.svg',
  'published',
  now() - interval '1 days'
)
on conflict (slug) do nothing;
