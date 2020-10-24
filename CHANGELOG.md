# CHANGELOG // nearest-plane

## Dev: v2.3.2
## Stable: v2.3.0

---

## v2.3.0 | 09-24-2020
*Under the hood*
- Added "View raw" button to output slides
  - This displays the raw JSON response from the OpenSky API
- Removed the ability to close popups by clicking anywhere on the page
  - Popups will now be closed only with the "x" button in the top-right corner
  - This was preventing users from copying text from popups, so this should fix that

---

## v2.2.8 | 09-14-2020
*Patience*
- Added a loading icon, which displays while fetching data
  - No more staring at a blank box wondering if the site crashed or not :)
- Fixed a few bugs
- Minor source code housekeeping changes

---

## v2.1.6 | 09-11-2020
*It's Time*
- Added timestamps to output (`hh:mm:ss` format)
- Made some changes to output property descriptions to improve clarity
- Updated some HTML elements to more modern versions

---

## v2.0.3 | 09-06-2020
*Easy on the eyes*
- Changed the default font behaviour for the site
  - All text-based elements will now use the UI font of whatever operating system you are currently on (a.k.a `system-ui`)
  - Essentially, it will try to match the font on the page to the one that you're used to seeing everywhere else on your system
  - Plus, I really like how the default Windows 10 font looks
- Removed unused CSS classes
- Added an indicator to show which slide you are currently on, as well as the total number of slides
- Changed the main heading of the page from "What is Nearest Plane?" to simply "Nearest Plane"

---

## v2.0.0 | 09-01-2020
*Past and Future*
- Added slides feature for output
  - Each time you press `go`, the results will be added to a list of all outputs rather than overwriting the previous results
  - This allows you to view multiple different aircraft near multiple locations
  - It also makes it much easier to track the motion of a particular aircraft over time
- Made a few optimizations to backend to reduce load times
- Fixed a few rare bugs
- Minor UI/UX changes

---

## v1.0.0 | 08-25-2020
*Takeoff*
- First working version!
- All functionality implemented and operable
- Backend almost complete
- UI/UX features mostly finished
  - Background carousel
  - Automatic location fill
  - Input checking
