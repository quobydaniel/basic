# BASIC
# COMPLETE FRONTEND DESIGN & ENGINEERING MASTER SPECIFICATION

**Project:** BASIC  
**Product:** AI-powered social-commerce marketplace  
**Brand identity:** BASIC PEARL  
**Primary market:** Ghana  
**Currency:** Ghanaian Cedi (GH₵)  
**Development responsibility:** Complete frontend design and implementation  
**Backend responsibility:** Existing BASIC backend must remain protected and independent.

---

# PART 1 — YOUR MISSION

You are the principal product designer, UI/UX architect, senior frontend engineer and design systems specialist responsible for building the complete BASIC application.

You are not building a simple e-commerce website.

You are building a modern AI-powered social marketplace where:

- Buyers discover products and businesses.
- Sellers operate their businesses through intelligent dashboards.
- AI assists buyers throughout their shopping journey.
- AI Autopilot helps sellers manage repetitive operations.
- Sellers publish stories and short-form videos.
- Buyers discover and interact with sellers.
- Affiliates promote products and earn commissions.
- Riders manage deliveries.
- Administrators oversee the entire platform.

The frontend must feel like one unified, sophisticated digital ecosystem.

Your assignment is to implement EVERY page, not just the homepage.

Do not stop after completing a landing page or dashboard.

Do not leave important pages as placeholders.

Do not simply apply a global CSS theme to existing pages and call the work complete.

Study the existing project, establish the architecture, and build the full interface systematically.

## The central objective

Deliver a complete, visually polished, responsive, independently runnable BASIC frontend that can subsequently be integrated with the existing BASIC backend.

---

# PART 2 — NON-NEGOTIABLE PRODUCT REQUIREMENT: NO SHOPPING CART

BASIC WILL NOT HAVE A SHOPPING CART.

This is an explicit product decision.

Do not build:

- Shopping cart pages.
- Cart drawers.
- Cart icons.
- Cart counters.
- Add-to-cart buttons.
- Persistent shopping baskets.
- Multi-product cart checkout.
- Cart-related navigation.
- Any cart functionality disguised under another name.

Remove cart concepts from all frontend navigation, interfaces and user flows.

## How purchasing should work

Build a direct purchasing and seller-engagement experience.

On the product page, buyers should be able to:

1. Select an available product variation.
2. Select quantity where supported.
3. View product availability.
4. View delivery information.
5. Select BUY NOW or ORDER NOW, depending on the actual supported workflow.
6. Continue into the appropriate direct-order process.
7. Contact the seller.
8. Ask the unified AI concierge for assistance.
9. Save the product to favourites where supported.
10. Share the product.

The direct-order experience must use existing backend order contracts.

Do not invent payment or order-creation functionality.

Where the backend requires seller confirmation, clearly present that step.

Products should not need to pass through a shopping basket before an order can be initiated.

A buyer's existing orders, order history and order details are essential features. They are not shopping-cart functionality.

---

# PART 3 — DESIGN DIRECTION: BASIC PEARL

The entire interface must follow the BASIC PEARL visual identity.

The objective is a premium, modern, understated and intelligent design.

Think of a sophisticated combination of:
- A premium digital marketplace.
- A modern social platform.
- An AI-powered business operating system.
- A polished financial technology dashboard.

Do not make BASIC look like a generic template.

## 3.1 Visual identity

Primary palette:

| Token | Suggested colour |
|---|---|
| Pearl | #FAF9F6 |
| Warm ivory | #F5F2EC |
| Pure white | #FFFFFF |
| Champagne gold | #C6A66B |
| Light champagne | #E9D9B7 |
| Charcoal | #242321 |
| Secondary text | #77736D |
| Muted border | #EAE6DE |

Gold should be used carefully for:
- Primary highlights.
- Selected navigation.
- Premium indicators.
- Special actions.
- Subtle decorative details.

Avoid excessive gold backgrounds.

Use dark charcoal for strong text and essential actions.

## 3.2 Typography

Create a consistent typography system.

Use elegant display typography for selected hero sections and page headings.

Use readable sans-serif typography for operational interfaces.

Maintain:
- Clear heading hierarchy.
- Consistent text sizes.
- Balanced line spacing.
- Accessible font sizes.
- Strong legibility on mobile.

## 3.3 Layout philosophy

Use:
- Generous but controlled spacing.
- Clean page composition.
- Refined cards.
- Subtle borders.
- Soft shadows.
- Consistent corner radii.
- Well-designed empty states.
- Strong product imagery.
- High-quality icons.
- Subtle animations.

Avoid:
- Excessive gradients.
- Excessive glassmorphism.
- Overly rounded elements everywhere.
- Oversized unnecessary whitespace.
- Crowded information.
- Random design changes between pages.

## 3.4 Modern interaction design

Every interaction must feel intentional.

Use:
- Smooth page transitions.
- Refined hover effects.
- Button feedback.
- Skeleton loading.
- Toast notifications.
- Contextual popovers.
- Proper modal and drawer behaviour.
- Accessible keyboard interactions.

Respect reduced-motion preferences.

---

# PART 4 — COMPLETE APPLICATION ARCHITECTURE

Build the application as a coherent platform.

The following route names are logical page identifiers, not permission to create incompatible URLs. Inspect the existing route structure first and preserve compatible existing routes.

Recommended application areas:

1. Public marketplace.
2. Buyer workspace.
3. Seller workspace.
4. Seller AI workspace.
5. Affiliate workspace.
6. Rider workspace.
7. Administrator workspace.
8. Authentication and onboarding.

Create consistent layouts for each application area.

Use role-aware navigation and permissions.

Never rely on frontend visibility alone for security.

---

# PART 5 — GLOBAL PUBLIC NAVIGATION

## PAGE 1: Public Marketplace Header

Build a premium responsive global header.

### Desktop

Include:
- BASIC logo.
- Home.
- Discover.
- Categories or relevant discovery entry.
- Shorts.
- Appropriate seller/store discovery access.
- Notifications when authenticated.
- Sign-in or profile access.
- Relevant account actions.

Do not overcrowd the header.

Do not put a large search field permanently across the header.

Search belongs primarily in Discover and contextual discovery interfaces.

### Mobile

Create a clean responsive header.

Include:
- BASIC brand mark.
- Contextual page title where appropriate.
- Relevant notifications.
- Profile access.

Keep the mobile header compact.

## PAGE 2: Global Mobile Navigation

Use the approved five-item bottom navigation:

HOME | DISCOVER | AI | CHAT | PROFILE

The AI button must occupy the central position and be visually prominent.

Include:
- Active states.
- Inactive states.
- Clear labels.
- Accessible touch targets.
- Safe-area padding.
- Smooth state transitions.

Ensure page content never sits underneath the navigation.

Adapt the navigation according to authentication and role.

Do not introduce a cart destination.

---

# PART 6 — BUYER EXPERIENCE

The buyer experience must make product discovery, seller interaction and direct ordering simple.

## PAGE 3: Marketplace Homepage

This is the primary public marketplace landing page.

Design it as a premium, dynamic and visually engaging commercial experience.

### Section A: Hero

Include:
- Strong headline.
- Short supporting message.
- Search/discovery action.
- Primary marketplace CTA.
- Secondary seller discovery CTA.
- Premium visual composition.

The hero should communicate what BASIC offers immediately.

Do not use generic slogans.

### Section B: Category discovery

Display categories in attractive visual cards.

Potential categories:
- Fashion.
- Electronics.
- Beauty.
- Home and Living.
- Food and Grocery.
- Phones and Accessories.
- Sports and Fitness.
- Lifestyle.
- Other categories supported by the database.

Categories must be data-driven where possible.

### Section C: Trending products

Display product cards with:
- Product image.
- Name.
- Price in GH₵.
- Seller identity.
- Availability where supported.
- Favourite button.
- Product link.

No cart button.

### Section D: Featured sellers

Display attractive seller cards.

Include:
- Store image.
- Seller name.
- Verification indicator where supported.
- Location.
- Rating where supported.
- Store preview.
- Visit storefront CTA.

### Section E: Stories

Display active seller stories in circular profile cards.

Use a visually clear active-story ring.

Tapping a story opens the full-screen viewer.

### Section F: Shorts

Show selected short-form content in an attractive discovery section.

Connect videos to their sellers and products.

### Section G: Recommendations

Display:
- Popular products.
- Recent discoveries.
- Relevant sellers.
- Category recommendations.

Use real personalization when supported.

### Section H: Seller invitation

Create a section encouraging businesses to join BASIC.

Include clear seller onboarding actions.

### Section I: Footer

Include:
- About BASIC.
- Help and support.
- Contact information.
- Seller registration.
- Buyer information.
- Policies.
- Social links.
- Relevant legal information.

Do not invent company addresses or legal information.

---

## PAGE 4: Discover

Create a dedicated product and business discovery experience.

### Layout

Desktop:
- Search area at the top.
- Filter area.
- Product grid.
- Optional discovery sidebar.

Mobile:
- Search at the top.
- Horizontal category chips.
- Expandable filters.
- Responsive product grid.

### Features

- Search products.
- Search sellers.
- Search stores.
- Search categories.
- Search suggestions.
- Recent searches where supported.
- Trending searches where supported.
- Filters.
- Sorting.
- Pagination or infinite loading.
- Product quick view.
- Seller quick view.
- Empty search results.
- Error states.

### Filters

Where supported:
- Category.
- Price range.
- Seller location.
- Store.
- Product availability.
- Rating.
- Relevant attributes.

Never display a filter that has no meaningful implementation.

---

## PAGE 5: Category Page

Each category should have an individual discovery page.

Include:
- Category banner.
- Category title.
- Description.
- Subcategories.
- Relevant products.
- Relevant stores.
- Sorting.
- Filtering.
- Pagination.

Maintain consistent visual structure across categories.

---

## PAGE 6: Product Details

This is one of the most commercially important pages.

Design it with exceptional attention to detail.

### Product gallery

Include:
- Main product image.
- Additional images.
- Thumbnail gallery.
- Full-screen image viewing.
- Image zoom where appropriate.

### Product information

Include:
- Product name.
- Current price.
- Previous price where applicable.
- Currency.
- Availability.
- Stock status.
- Seller name.
- Seller profile image.
- Seller verification where supported.
- Location where supported.

### Variations

Where applicable:
- Size.
- Colour.
- Model.
- Quantity.
- Other selectable attributes.

Only display variations supported by product data.

### Main actions

Primary:
BUY NOW or ORDER NOW.

Secondary:
MESSAGE SELLER.

Other:
- Favourite.
- Share.
- Ask AI about this product.

There must be NO ADD TO CART action.

### Additional sections

- Product description.
- Specifications.
- Seller information.
- Delivery details.
- Return information where supported.
- Reviews where supported.
- Related products.
- More from this seller.

### Product AI integration

The AI concierge should open with the product context when launched from this page.

Examples:
- Explain the product.
- Compare supported product attributes.
- Answer questions using verified product information.
- Help the buyer understand delivery information.

Do not generate unsupported product facts.

---

## PAGE 7: Direct Order Initiation

Build the ordering process without a shopping cart.

The page must start from an individual product or another supported seller workflow.

### Possible flow

1. Confirm product.
2. Confirm selected variations.
3. Confirm quantity.
4. Confirm buyer information.
5. Select or enter delivery details.
6. Review order information.
7. Continue through the existing payment or seller-confirmation workflow.
8. Display confirmation or pending status.

The exact steps must follow the existing backend contracts.

If a backend operation is unavailable, clearly identify it as an integration dependency.

Do not invent payment processing.

Do not create a cart as an alternative.

---

## PAGE 8: Seller Storefront

Every seller should have an individual storefront.

This must feel like a premium mini-website inside BASIC.

### Store hero

Include:
- Cover image.
- Store profile image.
- Store name.
- Description.
- Verification status where supported.
- Rating where supported.
- Location.
- Follow action where supported.
- Message seller action.

### Store navigation

Include contextual sections such as:
- Overview.
- Products.
- Shorts.
- Reviews, if supported.
- About.

IMPORTANT:

Do not create a separate Stories tab.

Stories are represented through the seller's profile image and active-story ring.

### Store content

Include:
- Featured products.
- Product catalogue.
- Category filters.
- Bestsellers where supported.
- New arrivals.
- Related products.

### Store AI experience

A contextual AI assistant must be visible.

The assistant opens the same unified buyer AI concierge.

---

## PAGE 9: Seller Story Entry

When a seller has active stories:

- Add the WhatsApp-style circular highlight around the seller profile image.
- Display the seller in story discovery sections.
- Clearly distinguish viewed and unviewed stories.
- Support story entry from appropriate buyer surfaces.

Do not invent additional navigation tabs.

---

## PAGE 10: Full-Screen Story Viewer

Design a mobile-first, full-screen story experience.

Include:
- Story media.
- Progress bars.
- Previous and next story navigation.
- Close control.
- Seller identity.
- Timestamp where available.
- Product links where supported.
- Seller storefront entry.
- Appropriate interaction controls.

Use appropriate tap and swipe behaviour.

Avoid obstructing the content.

---

## PAGE 11: Shorts Discovery

Create a dedicated modern video discovery interface.

### Video presentation

Use:
- Large video display.
- Vertical video layout.
- Seller information.
- Product context.
- Responsive playback controls.

### Interactions

Where supported:
- Like.
- Comment.
- Share.
- Follow seller.
- Visit storefront.
- View linked product.

Use touch-friendly controls.

### Performance

- Lazy-load videos.
- Display poster images.
- Show loading states.
- Handle failed playback.
- Avoid loading every video simultaneously.

---

## PAGE 12: Short Video Detail and Comments

Build a dedicated interaction surface where applicable.

Include:
- Video.
- Seller profile.
- Caption.
- Product association.
- Comments.
- Comment submission where supported.
- Likes.
- Sharing.
- Related videos.

Display real engagement values only.

---

# PART 7 — UNIFIED BUYER AI CONCIERGE

## PAGE 13: AI Concierge Interface

This must remain ONE unified buyer AI assistant.

Do not build separate homepage, product and storefront assistants with independent identities.

The interface should adapt to its current context.

### Main interface

Include:
- AI identity.
- Conversation history.
- Message composer.
- Message bubbles.
- Typing indicator.
- Suggested prompts.
- Product cards where relevant.
- Seller cards where relevant.
- Loading states.
- Error handling.
- New conversation.
- Conversation history.

### Contextual behaviour

From Discover:
Help with discovery and searches.

From a product page:
Help explain that product.

From a storefront:
Help buyers understand the seller's catalogue.

From a conversation:
Provide supported assistance based on conversation context.

From the buyer workspace:
Help with supported buyer tasks and order information.

### Important

The AI must use the existing AI gateway and supported backend functions.

Do not hardcode AI responses and represent them as real AI.

Do not expose provider keys in frontend code.

---

# PART 8 — BUYER ACCOUNT WORKSPACE

Create a dedicated buyer dashboard with consistent navigation.

## PAGE 14: Buyer Overview

Include:
- Welcome section.
- Profile image.
- Account summary.
- Recent orders.
- Active deliveries.
- Recent conversations.
- Favourite products.
- Followed stores.
- Notifications.
- Quick actions.

Do not add cart summaries.

## PAGE 15: Buyer Profile

Include:
- Profile image.
- Name.
- Contact information.
- Location.
- Account details.
- Profile editing.
- Privacy preferences where supported.

## PAGE 16: My Orders

Include:
- Order list.
- Order references.
- Seller.
- Product summary.
- Order date.
- Amount.
- Current status.
- Delivery information.

Provide filters for relevant order statuses.

## PAGE 17: Order Details

Include:
- Order reference.
- Product information.
- Seller.
- Quantity and variations.
- Payment status where supported.
- Order status.
- Delivery information.
- Status history.
- Seller contact.
- Support actions.

Display a clear order timeline.

## PAGE 18: Delivery Tracking

Include:
- Delivery status.
- Order reference.
- Rider information where available.
- Current tracking information where supported.
- Delivery progress.
- Estimated arrival only when supported.
- Relevant contact actions.

Do not invent live GPS tracking.

## PAGE 19: Favourites

Display saved products.

Include:
- Product images.
- Product titles.
- Prices.
- Seller names.
- Availability.
- Product navigation.
- Remove favourite action.

No cart action.

## PAGE 20: Followed Stores

Include:
- Store identity.
- Profile image.
- Active story indicator.
- Store name.
- New content indicators where supported.
- Visit storefront.
- Unfollow action.

## PAGE 21: Buyer Conversations

Display all buyer-seller conversations.

Include:
- Seller profile.
- Last message.
- Timestamp.
- Unread indicators.
- Conversation search.
- Relevant order context.

## PAGE 22: Buyer Chat

Include:
- Conversation header.
- Seller details.
- Messages.
- Message composer.
- Image attachments where supported.
- Product references.
- Order references.
- Read status where supported.
- Contextual AI assistance.

Keep conversations private and correctly associated with their backend identities.

## PAGE 23: Notifications

Include:
- Order notifications.
- Seller responses.
- Delivery notifications.
- Relevant platform alerts.
- Read/unread states.
- Notification history.

## PAGE 24: Saved Addresses

Include:
- Address list.
- Add address.
- Edit address.
- Delete address.
- Default address selection.

Only expose supported address fields.

## PAGE 25: Account Settings

Include:
- Personal information.
- Password/security.
- Notification preferences.
- Privacy.
- Session controls where supported.
- Account management.

---

# PART 9 — SELLER STOREFRONT AND OPERATING EXPERIENCE

This is BASIC's highest strategic priority.

A seller must feel that BASIC provides a complete digital operating environment for their business.

Do not design it like a generic admin dashboard.

It must be modern, clear, efficient and AI-assisted.

Create a distinct seller application shell.

## PAGE 26: Seller Dashboard Overview

Include:

### Header
- Store identity.
- Seller profile.
- Notifications.
- AI Autopilot status.
- Account menu.

### Business summary
- Sales figures where supported.
- Order count.
- Active products.
- Inventory alerts.
- Store activity.

### Order overview
- New orders.
- Processing orders.
- Orders awaiting action.
- Completed orders.

### AI activity
- Latest AI summaries.
- Buyer follow-ups.
- Stock reminders.
- Pending approvals.
- Autopilot state.

### Performance
- Sales chart.
- Order chart.
- Product performance.
- Customer activity where supported.

### Quick actions
- Create product.
- View orders.
- Open inbox.
- Open Autopilot.
- Manage storefront.
- Publish content.

Do not invent analytical data.

---

## PAGE 27: Seller Products

Build a complete product management workspace.

Include:
- Product table or responsive cards.
- Product search.
- Filters.
- Category.
- Status.
- Price.
- Stock.
- Product image.
- Edit actions.
- Visibility state.
- Delete/archive where supported.

Include bulk actions only where supported.

Mobile should use well-designed product cards rather than squeezed desktop tables.

---

## PAGE 28: Create Product

Create a comprehensive product creation experience.

Sections:

1. Product identity.
2. Product name.
3. Description.
4. Category.
5. Images.
6. Price.
7. Previous price where applicable.
8. Inventory.
9. Variations.
10. Product specifications.
11. Delivery information where supported.
12. Visibility/status.

Include:
- Image upload.
- Image previews.
- Image removal.
- Validation.
- Save draft where supported.
- Publish action.

Provide clear progress and error states.

---

## PAGE 29: Edit Product

Reuse the product editor.

Prepopulate existing data.

Support:
- Product image updates.
- Pricing changes.
- Stock changes.
- Description changes.
- Category changes.
- Variation updates.
- Status updates.

Protect against accidental data loss.

---

## PAGE 30: Inventory Management

Include:
- Stock overview.
- Low-stock products.
- Out-of-stock products.
- Inventory search.
- Product stock.
- Stock adjustment.
- Availability.
- Relevant history where supported.

Use clear status indicators.

---

## PAGE 31: Seller Orders

Create a dedicated order operations workspace.

Separate relevant order stages.

Possible stages, subject to actual backend status definitions:

- New.
- Confirmed.
- Processing.
- Ready.
- Dispatched.
- Completed.
- Cancelled.

Each order card should display:
- Order reference.
- Buyer.
- Product summary.
- Amount.
- Order date.
- Current state.
- Required action.

Provide filters and search.

---

## PAGE 32: Seller Order Details

Include:
- Buyer identity.
- Order contents.
- Product details.
- Variations.
- Amount.
- Payment information where supported.
- Delivery information.
- Status history.
- Communication entry.
- Available seller actions.

Actions must correspond to existing backend workflows.

---

## PAGE 33: Seller Inbox

A major feature.

Build a professional messaging workspace.

Desktop:
- Conversation list.
- Active conversation.
- Context panel.

Mobile:
- Conversation list.
- Dedicated full-screen conversation.

Include:
- Buyer avatar.
- Buyer name.
- Last message.
- Timestamp.
- Unread count.
- Search.
- Filters.
- Conversation status where supported.
- Product context.
- Order context.
- Message attachments where supported.

Provide a clear human takeover experience.

---

## PAGE 34: Seller Conversation

Include:
- Buyer identity.
- Conversation messages.
- Product references.
- Order information.
- Message composer.
- Attachment actions where supported.
- AI response state.
- Human/AI control indicator.
- Pause AI.
- Resume AI.
- Take over conversation.

AI actions must be clearly distinguished from human actions.

---

# PART 10 — SELLER AI AUTOPILOT

## PAGE 35: Autopilot Overview

Build a sophisticated AI operations dashboard.

Include:
- Autopilot status.
- Enable/pause control.
- Current operating state.
- Recent AI activity.
- Order summaries.
- Buyer messages.
- Follow-up reminders.
- Stock alerts.
- Pending approvals.
- Operational notifications.

The page must communicate what AI is currently doing.

Do not imply that AI actions occurred when they did not.

## PAGE 36: Autopilot Conversations

Include:
- AI-managed conversations.
- Buyer identity.
- Last activity.
- Current status.
- AI response summary.
- Human takeover.
- Conversation-level pause.
- Resume.

## PAGE 37: Autopilot Activity Log

Include:
- Activity type.
- Timestamp.
- Related buyer/order/product.
- Action result.
- Success/failure status.
- Relevant explanation.

Display only actual recorded events.

## PAGE 38: Autopilot Settings

Include configuration for supported capabilities:

- AI availability.
- Seller response preferences.
- Supported price boundaries.
- Negotiation preferences.
- Operational instructions.
- Buyer follow-up settings.
- Notification preferences.
- Conversation controls.

Never create settings that cannot be enforced by the backend.

## PAGE 39: Pending AI Approvals

Include actions requiring seller confirmation.

Display:
- Proposed action.
- Context.
- Buyer or order.
- Reason for approval.
- Confirm.
- Reject.
- More information.

Only display real pending actions.

---

# PART 11 — SELLER WHATSAPP AI CONNECTION

## PAGE 40: WhatsApp AI Connection

Create a configuration interface for the proposed seller-to-AI WhatsApp channel.

This channel is for sellers communicating with their own AI Autopilot.

It is NOT the buyer-seller messaging channel.

Include:
- Connection status.
- Account linking.
- Setup instructions.
- Notifications.
- Supported seller commands.
- Permission explanations.
- Disconnect action.

Show a connected state only when a real provider connection exists.

Do not simulate WhatsApp integration.

For sensitive or consequential seller operations, require the appropriate confirmation and security controls.

---

# PART 12 — SELLER SOCIAL CONTENT

## PAGE 41: Seller Stories Management

Create a dedicated story management workspace.

Include:
- Active stories.
- Story previews.
- Story upload.
- Media selection.
- Publishing.
- Expiration status where supported.
- Remove story.
- Story performance where supported.

Stories should be discoverable through the seller profile's circular highlight.

Do not create a Stories tab in the storefront navigation.

## PAGE 42: Seller Shorts Management

Include:
- Published Shorts.
- Video upload.
- Video preview.
- Caption.
- Product association.
- Publishing state.
- Remove/archive where supported.
- Engagement information where supported.

## PAGE 43: Publish Short

Create a mobile-friendly publishing experience.

Include:
- Video selection.
- Video preview.
- Caption.
- Product association.
- Cover image where supported.
- Visibility controls where supported.
- Publish.

Do not claim that unsupported editing or transcoding features exist.

---

# PART 13 — STORE MANAGEMENT

## PAGE 44: Storefront Editor

Allow sellers to manage supported storefront information.

Include:
- Store name.
- Store description.
- Cover image.
- Profile image.
- Contact information.
- Location.
- Store categories.
- Store presentation.
- Available policies.

Show a live storefront preview where practical.

## PAGE 45: Store Performance

Include:
- Store views.
- Product views.
- Engagement.
- Sales performance.
- Conversion metrics where supported.
- Relevant time filters.

Only display data supplied by the backend.

## PAGE 46: Seller Notifications

Include:
- New orders.
- Buyer messages.
- Stock alerts.
- AI activity.
- Store alerts.
- Platform announcements.

Provide appropriate notification preferences.

## PAGE 47: Seller Account and Settings

Include:
- Profile.
- Business information.
- Account security.
- Notifications.
- Store preferences.
- AI configuration entry.
- Connected services where supported.

---

# PART 14 — PREMIUM STOREFRONT AI AVATAR

This is a tiered visual experience.

## Free seller

Show a floating animated AI orb.

It must:
- Have subtle idle animation.
- Respond to appropriate interactions.
- Remain unobtrusive.
- Open the unified buyer AI concierge.

## Premium seller

Show a lifelike animated 3D AI avatar.

Possible behaviour:
- Looking around.
- Welcoming store visitors.
- Waving.
- Gesturing towards featured products.
- Responding to interactions.

The avatar must be performance-efficient.

Provide:
- Reduced-motion support.
- Mobile fallback.
- Accessible controls.
- Efficient loading.

Both avatar experiences open the SAME buyer AI concierge.

Do not build separate assistants.

Subscription entitlements and premium access must be determined through real backend contracts.

---

# PART 15 — AFFILIATE EXPERIENCE

Create an independent affiliate workspace.

## PAGE 48: Affiliate Overview

Include:
- Affiliate profile.
- Earnings summary.
- Referrals.
- Conversion summary where supported.
- Recent activity.
- Quick actions.

## PAGE 49: Affiliate Product Discovery

Include:
- Promotable products.
- Search.
- Categories.
- Product information.
- Seller details.
- Promotion entry points.

Only products eligible for affiliate promotion should appear.

## PAGE 50: Affiliate Product Details

Include:
- Product information.
- Seller.
- Applicable commission details where supported.
- Referral generation.
- Promotional information.
- Sharing tools.

## PAGE 51: Referral Links

Include:
- Referral links.
- Product association.
- Creation date.
- Copy link.
- Sharing actions.
- Active status where supported.

## PAGE 52: Campaigns

Include campaign information where supported.

Display:
- Campaign name.
- Products.
- Promotional assets.
- Dates.
- Performance.

## PAGE 53: Affiliate Analytics

Include:
- Clicks.
- Conversions.
- Referral activity.
- Earnings.
- Product performance.
- Time filters.

Never fabricate results.

## PAGE 54: Affiliate Earnings

Include:
- Available earnings.
- Pending earnings.
- Confirmed commissions.
- Payout history.
- Payout information.

Show actual backend payment states.

## PAGE 55: Affiliate Profile and Settings

Include:
- Profile.
- Account details.
- Payout information.
- Notifications.
- Security.

---

# PART 16 — RIDER EXPERIENCE

The rider experience must be mobile-first.

A rider should be able to understand the next task immediately.

Use large, clear controls and minimal distraction.

## PAGE 56: Rider Dashboard

Include:
- Rider identity.
- Availability.
- Assigned deliveries.
- Active delivery.
- Completed deliveries.
- Earnings where supported.
- Notifications.

## PAGE 57: Availability Management

Include:
- Available/unavailable control.
- Current status.
- Status confirmation.
- Relevant restrictions or explanations.

The UI must respect backend eligibility and status controls.

## PAGE 58: Delivery Assignments

Include:
- Order reference.
- Pickup location.
- Delivery destination.
- Delivery instructions.
- Relevant assignment state.
- Accept/decline actions where supported.

## PAGE 59: Active Delivery

Include:
- Order details.
- Pickup information.
- Destination.
- Customer information.
- Delivery progress.
- Contact actions.
- Relevant navigation entry points.
- Available delivery actions.

## PAGE 60: Delivery Details

Include:
- Full assignment information.
- Seller.
- Buyer.
- Product/order reference.
- Pickup instructions.
- Drop-off instructions.
- Delivery status.

## PAGE 61: Delivery Confirmation

Include the actual confirmation mechanism supported by the backend.

Examples may include:
- Status confirmation.
- Proof of delivery.
- Confirmation information.

Do not invent signature, OTP, photograph or location-verification requirements.

## PAGE 62: Rider Delivery History

Include:
- Completed deliveries.
- Cancelled assignments where relevant.
- Dates.
- Status.
- Available delivery details.

## PAGE 63: Rider Earnings

Include:
- Earnings.
- Completed jobs.
- Pending amounts.
- Payment history.

Only use real payment records.

## PAGE 64: Rider Profile and Settings

Include:
- Personal profile.
- Account information.
- Vehicle details where supported.
- Verification state.
- Documents where supported.
- Availability preferences.
- Security.

Never invent verification approval.

---

# PART 17 — SUPER ADMIN

Administration is a separate professional control centre.

Build a clear desktop-first workspace.

## PAGE 65: Admin Overview

Include:
- Platform activity.
- User summaries.
- Seller summaries.
- Product activity.
- Order activity.
- Relevant transactions.
- Reports.
- Alerts.
- Platform health where supported.

Avoid decorative fake statistics.

## PAGE 66: User Management

Include:
- User list.
- Search.
- Filters.
- Role.
- Account status.
- Registration date.
- User details.
- Available moderation actions.

## PAGE 67: User Details

Include:
- Profile information.
- Role.
- Status.
- Relevant account history.
- Available admin actions.
- Audit information where supported.

## PAGE 68: Seller Management

Include:
- Seller list.
- Store identity.
- Verification state.
- Status.
- Location.
- Product activity.
- Available review actions.

## PAGE 69: Seller Details

Include:
- Seller profile.
- Business information.
- Storefront preview.
- Product catalogue.
- Relevant order information.
- Verification information.
- Moderation history where supported.

## PAGE 70: Rider Management

Include:
- Rider directory.
- Verification status.
- Availability where supported.
- Delivery activity.
- Account details.

## PAGE 71: Affiliate Management

Include:
- Affiliate directory.
- Account status.
- Referral activity.
- Earnings information where supported.
- Applicable moderation actions.

## PAGE 72: Product Moderation

Include:
- Product list.
- Product images.
- Seller.
- Product category.
- Publication state.
- Review information.
- Supported moderation actions.

## PAGE 73: Store Moderation

Include:
- Store profiles.
- Seller information.
- Store visibility.
- Report information.
- Available moderation actions.

## PAGE 74: Order Oversight

Include:
- Order list.
- Order reference.
- Buyer.
- Seller.
- Amount.
- Current status.
- Relevant timestamps.
- Search and filtering.

## PAGE 75: Transaction Management

Include:
- Transaction reference.
- Associated order.
- Relevant buyer/seller.
- Amount.
- Payment state.
- Transaction history where supported.

Never imply payment reversal or settlement functionality that does not exist.

## PAGE 76: Reports and Abuse Management

Include:
- Report queue.
- Report category.
- Reported entity.
- Reporter information where permitted.
- Evidence where available.
- Review status.
- Resolution workflow.

## PAGE 77: Disputes

Include disputes only where supported by actual backend workflows.

Display:
- Dispute reference.
- Order.
- Involved parties.
- Dispute reason.
- Evidence.
- Status.
- Resolution information.

## PAGE 78: Platform Analytics

Include:
- User growth.
- Seller growth.
- Orders.
- Product activity.
- Relevant revenue metrics.
- Marketplace activity.
- Time filters.

All analytics must use actual data.

## PAGE 79: AI Operations Monitoring

Build a monitoring interface for supported AI activity.

Include:
- AI requests.
- Usage.
- Current operational status.
- Errors.
- Relevant activity summaries.
- Provider information only where safe and supported.

Never expose provider credentials.

## PAGE 80: Admin Settings

Include:
- Platform settings exposed through existing supported controls.
- Administrative preferences.
- Moderation settings where supported.
- Notification settings.
- Account security.
- Audit access where supported.

Do not invent configuration endpoints.

---

# PART 18 — AUTHENTICATION AND ONBOARDING

These pages must be designed as carefully as the main marketplace.

## PAGE 81: Sign In

Include:
- BASIC branding.
- Email/phone field where supported.
- Password.
- Show/hide password.
- Remember session where appropriate.
- Password recovery.
- Sign-in feedback.
- Sign-up navigation.

## PAGE 82: Create Account

Include:
- Name.
- Email.
- Phone where supported.
- Password.
- Confirmation.
- Terms acceptance.
- Form validation.

## PAGE 83: Password Recovery

Include:
- Email or supported recovery identifier.
- Submission state.
- Confirmation state.
- Error state.

## PAGE 84: Account Verification

Use the actual available verification method.

Do not simulate verification success.

## PAGE 85: Role Selection and Onboarding

Present available account roles.

Build contextual onboarding for:
- Buyer.
- Seller.
- Rider.
- Affiliate.

Use appropriate onboarding forms.

## PAGE 86: Seller Onboarding

Include only supported seller registration requirements.

Where available:
- Business name.
- Store name.
- Business category.
- Contact details.
- Location.
- Store image.
- Relevant verification information.

Display verification progress accurately.

## PAGE 87: Rider Onboarding

Include supported information and verification steps.

## PAGE 88: Affiliate Onboarding

Include relevant registration and profile information.

---

# PART 19 — MODALS, DRAWERS AND SHARED INTERACTIONS

Do not treat these as unimportant details.

Build a reusable system for:

- Product quick view.
- Seller preview.
- Story viewer.
- Notification drawer.
- Profile menu.
- Search suggestions.
- Confirmation dialogs.
- Form dialogs.
- Mobile bottom sheets.
- Contextual action menus.
- AI assistant entry.
- Error dialogs.
- Success notifications.

All overlays must work correctly on desktop and mobile.

Ensure keyboard accessibility and appropriate focus management.

---

# PART 20 — EMPTY, LOADING AND ERROR STATES

Every data-driven page must handle:

1. Loading.
2. Successful data display.
3. Empty results.
4. Failed requests.
5. No network connection.
6. Permission errors.
7. Unavailable functionality.

Do not leave blank pages.

Create polished empty states with useful guidance.

Example:

No products found:
Provide a clear message and relevant discovery action.

No orders:
Explain that new orders will appear here.

No messages:
Provide an appropriate conversation entry point.

Do not show misleading success notifications.

---

# PART 21 — DESKTOP AND MOBILE PAGE SPECIFICATIONS

Every page must have two intentional layout treatments.

## Desktop

Use:
- Appropriate page width.
- Clear content hierarchy.
- Desktop navigation.
- Suitable sidebars.
- Efficient information density.
- Structured data tables where appropriate.

## Mobile

Use:
- Compact headers.
- Five-item bottom navigation where appropriate.
- Responsive cards.
- Full-screen chat when appropriate.
- Bottom sheets instead of cramped dialogs.
- Touch-friendly controls.
- Carefully sized typography.
- Safe-area padding.

Mobile must not be an afterthought.

---

# PART 22 — DESIGN AND IMPLEMENTATION WORKFLOW

Before implementation, inspect the repository.

Identify:
- Existing routes.
- Existing page components.
- Existing shared components.
- Existing CSS.
- Existing design tokens.
- Existing dependency versions.
- Backend integration boundaries.
- Empty or incomplete files.

Then produce a complete route inventory.

For every route, record:
- Page name.
- Role.
- Desktop layout.
- Mobile layout.
- Main features.
- Backend dependencies.
- Reusable components.

Implement in coordinated stages.

### Stage 1
Design system and global layouts.

### Stage 2
Public marketplace pages.

### Stage 3
Product discovery and product details.

### Stage 4
Storefronts and social-commerce pages.

### Stage 5
Buyer account workspace.

### Stage 6
Seller dashboard and management.

### Stage 7
Seller AI Autopilot.

### Stage 8
Affiliate workspace.

### Stage 9
Rider workspace.

### Stage 10
Administration.

### Stage 11
Authentication and onboarding.

### Stage 12
Responsive refinement and integration documentation.

Do not deliver a collection of unfinished pages.

---

# PART 23 — TECHNICAL REQUIREMENTS

Use the existing stack wherever possible.

Known project stack:

- React 19.
- TanStack Start.
- Vite.
- TypeScript.
- Tailwind CSS.
- Supabase.
- Existing AI gateway.

Do not replace the framework without a strong reason.

Create a reusable component architecture.

Suggested structure:

src/
  components/
    ui/
    navigation/
    product/
    seller/
    buyer/
    social/
    chat/
    ai/
    dashboard/
  features/
    marketplace/
    discover/
    storefront/
    stories/
    shorts/
    buyer/
    seller/
    autopilot/
    affiliate/
    rider/
    admin/
    auth/
  layouts/
  routes/
  hooks/
  services/
  types/
  lib/
  styles/
  assets/

Adapt this to the actual project rather than forcing an incompatible structure.

---

# PART 24 — BACKEND PROTECTION

This project is frontend-first.

Do not modify:
- Supabase migrations.
- Database tables.
- Database functions.
- RPC signatures.
- RLS policies.
- Authentication architecture.
- Existing AI gateway contracts.
- Existing business workflows.

Build frontend adapters around verified existing contracts.

Do not assume that a visually represented action is already implemented.

Where a capability is not supported:

1. Document it.
2. Isolate its service interface.
3. Avoid claiming success.
4. Keep the interface ready for future integration.

Never expose secret credentials in frontend bundles.

---

# PART 25 — FINAL DELIVERABLE

The final deliverable must contain:

1. Complete BASIC frontend source.
2. All implemented page routes.
3. Complete design system.
4. Responsive desktop designs.
5. Responsive mobile designs.
6. Shared components.
7. Interaction implementations.
8. Service abstraction layer.
9. TypeScript types.
10. Required visual assets.
11. Route documentation.
12. Feature documentation.
13. Backend integration map.
14. Environment variable template.
15. Setup instructions.
16. Incomplete integration register.
17. Known limitations.

Provide one consolidated downloadable ZIP.

Keep the existing backend untouched.

---

# PART 26 — FINAL ACCEPTANCE REQUIREMENTS

Before considering the frontend complete, ensure:

- Every specified page has been implemented or explicitly documented as blocked by a missing backend contract.
- No shopping-cart functionality exists anywhere.
- No add-to-cart buttons exist.
- Direct-order entry points use the approved workflows.
- Navigation is consistent.
- The mobile five-item navigation is implemented appropriately.
- The unified buyer AI concierge is consistent.
- Seller Autopilot has its own complete workspace.
- Stories use profile-image rings, not a separate storefront tab.
- Shorts have a dedicated discovery experience.
- Premium and free storefront assistant treatments share one AI concierge.
- Seller, affiliate, rider and admin applications are visually consistent with BASIC.
- Desktop and mobile experiences are both intentionally designed.
- All visible actions have defined behaviour.
- Backend integration requirements are documented.
- Original backend functionality remains protected.

---

# FINAL COMMAND

Build BASIC as a complete, modern, AI-powered social-commerce platform.

Do not reduce this assignment to a homepage redesign.

Do not build a shopping cart.

Do not invent backend functionality.

Do not replace existing business logic.

Do not create multiple competing AI assistants.

Do not leave pages unfinished.

Prioritise seller operations and AI Autopilot while delivering a complete buyer, social, affiliate, rider and administration experience.

Study the supplied design references carefully and reproduce their visual language consistently.

Make intelligent design decisions without repeatedly interrupting implementation for approval.

The final result must be a cohesive, premium, modern BASIC application that is ready for integration with its existing backend.

**BUILD THE ENTIRE FRONTEND.**